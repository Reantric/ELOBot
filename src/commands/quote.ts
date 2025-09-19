import { SlashCommandBuilder } from '@discordjs/builders';
import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    Client,
    EmbedBuilder,
    Interaction,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import puppeteer from 'puppeteer';
import yahooFinance from 'yahoo-finance2';

import { IBotInteraction } from '../api/capi';
import { getQuote, getOptionChain, getRiskFreeRate } from '../util/trading/marketData.js';
import { bsGreeks, bsPrice, impliedVol } from '../util/trading/pricing.js';
import { timeToExpiry } from '../util/trading/time.js';
import { formatCurrency, formatNumber, formatPercentage, formatTimestamp, buildTradeEmbed } from '../util/trading/view.js';
import type { OptionContractQuote, OptionRight } from '../util/trading/types.js';
import { executeBuy, executeSell, TradeResultOrOrder } from '../util/trading/trades.js';

type TimeframeKey = 'DAY' | 'WEEK' | 'MONTH' | 'YTD';

interface ChartCacheEntry {
    buffer: Buffer;
    expires: number;
}

interface OptionSelectionResult {
    expiration: string;
    strike: number;
    right: OptionRight;
    contract: OptionContractQuote;
    usedPrompts: boolean;
}

const chartCache = new Map<string, ChartCacheEntry>();
const CHART_CACHE_TTL = 60_000;

export default class Quote implements IBotInteraction {
    name(): string {
        return 'quote';
    }

    help(): string {
        return 'Get the latest quote for a stock or option';
    }

    cooldown(): number {
        return 2;
    }

    perms(): 'admin' | 'user' | 'both' {
        return 'both';
    }

    isThisInteraction(command: string): boolean {
        return command === this.name();
    }

    data(): any {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help())
            .addStringOption(option => option.setName('symbol').setDescription('Ticker symbol').setRequired(true))
            .addStringOption(option => option.setName('expiration').setDescription('Option expiration YYYY-MM-DD'))
            .addNumberOption(option => option.setName('strike').setDescription('Option strike price'))
            .addStringOption(option => option
                .setName('right')
                .setDescription('Option type CALL/PUT')
                .addChoices(
                    { name: 'Call', value: 'CALL' },
                    { name: 'Put', value: 'PUT' },
                ))
            .addBooleanOption(option => option.setName('detailed').setDescription('Include interactive price chart'));
    }

    async runCommand(interaction: ChatInputCommandInteraction, _Bot: Client): Promise<void> {
        const symbol = interaction.options.getString('symbol', true).toUpperCase();
        const detailed = interaction.options.getBoolean('detailed') ?? false;
        const providedExpiration = interaction.options.getString('expiration');
        const providedStrike = interaction.options.getNumber('strike');
        const providedRight = interaction.options.getString('right') as OptionRight | null;

        const wantsOption = providedExpiration != null || providedStrike != null || providedRight != null;

        try {
            if (wantsOption) {
                const selection = await this.resolveOptionSelection(interaction, symbol, providedExpiration ?? undefined, providedStrike ?? undefined, providedRight ?? undefined);
                if (!selection) {
                    return;
                }

                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferReply({ ephemeral: true });
                } else if (selection.usedPrompts) {
                    await interaction.editReply({ content: 'Fetching option quote…', components: [] });
                }

                const { embed, underlyingQuote } = await this.optionQuote(symbol, selection.expiration, selection.strike, selection.right, selection.contract);
                const optionDetails = {
                    symbol,
                    expiration: selection.expiration,
                    strike: selection.strike,
                    right: selection.right,
                };
                const actionRow = this.buildOptionActionRow(interaction.id, optionDetails);

                if (!detailed) {
                    await interaction.editReply({ embeds: [embed], components: [actionRow] });
                    this.registerOptionActions(interaction, optionDetails);
                    return;
                }

                try {
                    const renderProvider = async (timeframe: TimeframeKey) => this.renderDetailedChart(
                        interaction,
                        `OPTION:${symbol}:${selection.expiration}:${selection.strike}:${selection.right}`,
                        symbol,
                        timeframe,
                        embed,
                        `Underlying price • Spot ${formatCurrency(underlyingQuote.price)}`
                    );
                    const timeframe: TimeframeKey = 'DAY';
                    const initial = await renderProvider(timeframe);
                    const buttons = this.buildTimeframeButtons(interaction.id, timeframe);
                    await interaction.editReply({ embeds: [initial.embed], files: [initial.attachment], components: [buttons, actionRow] });
                    this.registerCollector(interaction, renderProvider, timeframe, [actionRow]);
                    this.registerOptionActions(interaction, optionDetails);
                } catch (error) {
                    await interaction.editReply({ embeds: [embed], components: [actionRow], content: `⚠️ Chart unavailable: ${String(error)}` });
                    this.registerOptionActions(interaction, optionDetails);
                }
                return;
            }

            await interaction.deferReply({ ephemeral: true });
            const embed = await this.equityQuote(symbol);

            if (!detailed) {
                await interaction.editReply({ embeds: [embed], components: [] });
                return;
            }

            try {
                const renderProvider = async (timeframe: TimeframeKey) => this.renderDetailedChart(
                    interaction,
                    `EQUITY:${symbol}`,
                    symbol,
                    timeframe,
                    embed,
                    'Regular-hours price'
                );
                const timeframe: TimeframeKey = 'DAY';
                const initial = await renderProvider(timeframe);
                const buttons = this.buildTimeframeButtons(interaction.id, timeframe);
                await interaction.editReply({ embeds: [initial.embed], files: [initial.attachment], components: [buttons] });
                this.registerCollector(interaction, renderProvider, timeframe);
            } catch (error) {
                await interaction.editReply({ embeds: [embed], content: `⚠️ Chart unavailable: ${String(error)}`, components: [] });
            }
        } catch (error: any) {
            const message = error?.message ?? String(error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Failed to fetch quote: ${message}`, embeds: [], components: [] });
            } else {
                await interaction.reply({ content: `❌ Failed to fetch quote: ${message}`, ephemeral: true });
            }
        }
    }

    private async equityQuote(symbol: string): Promise<EmbedBuilder> {
        const quote = await getQuote(symbol);
        const changePercentDisplay = quote.changePercent != null ? formatPercentage((quote.changePercent ?? 0) / 100) : 'N/A';
        const fields = [
            { name: 'Price', value: formatCurrency(quote.price), inline: true },
            { name: 'Change', value: `${formatCurrency(quote.change ?? 0)} (${changePercentDisplay})`, inline: true },
            { name: 'Previous Close', value: formatCurrency(quote.previousClose ?? 0), inline: true },
            { name: 'Day Range', value: `${formatCurrency(quote.dayLow ?? quote.price)} – ${formatCurrency(quote.dayHigh ?? quote.price)}`, inline: true },
            { name: '52W Range', value: `${formatCurrency(quote.fiftyTwoWeekLow ?? quote.price)} – ${formatCurrency(quote.fiftyTwoWeekHigh ?? quote.price)}`, inline: true },
            { name: 'Volume', value: quote.volume ? `${quote.volume.toLocaleString('en-US')}` : 'N/A', inline: true },
        ];

        if (quote.preMarketPrice != null || quote.postMarketPrice != null) {
            const pre = quote.preMarketPrice != null ? `${formatCurrency(quote.preMarketPrice)} (${formatPercentage((quote.preMarketChangePercent ?? 0) / 100)})` : '—';
            const post = quote.postMarketPrice != null ? `${formatCurrency(quote.postMarketPrice)} (${formatPercentage((quote.postMarketChangePercent ?? 0) / 100)})` : '—';
            fields.push({ name: 'Pre-Market', value: pre, inline: true });
            fields.push({ name: 'Post-Market', value: post, inline: true });
        }

        const embed = new EmbedBuilder()
            .setTitle(`${symbol} Quote`)
            .setColor(0x3498db)
            .addFields(fields)
            .setFooter({ text: `Market time ${formatTimestamp(quote.regularMarketTime)}` });
        return embed;
    }

    private async optionQuote(
        symbol: string,
        expiration: string,
        strike: number,
        right: OptionRight,
        preselected?: OptionContractQuote
    ) {
        const chain = await getOptionChain(symbol, expiration);
        const bucket = right === 'CALL' ? chain.calls : chain.puts;
        const contract = preselected ?? bucket.find(item => Math.abs(item.strike - strike) < 1e-6);
        if (!contract) {
            throw new Error('Option contract not found for selected parameters');
        }

        const underlyingQuote = await getQuote(symbol);
        const riskFree = await getRiskFreeRate();
        const T = timeToExpiry(expiration);
        const isCall = right === 'CALL';
        const mid = contract.midpoint ?? contract.lastPrice ?? contract.bid ?? contract.ask ?? 0;
        const implied = contract.impliedVolatility && contract.impliedVolatility > 0
            ? contract.impliedVolatility
            : (mid > 0 ? impliedVol(underlyingQuote.price, strike, riskFree, T, isCall, mid) : 0.3);
        const theo = bsPrice(underlyingQuote.price, strike, riskFree, implied, T, isCall);
        const greeks = bsGreeks(underlyingQuote.price, strike, riskFree, implied, T, isCall);
        const breakeven = isCall ? strike + mid : strike - mid;

        const embed = new EmbedBuilder()
            .setTitle(`${symbol} ${expiration} ${right} ${formatNumber(strike, 2)}`)
            .setColor(isCall ? 0x9b59b6 : 0xe74c3c)
            .addFields(
                { name: 'Bid / Ask', value: `${formatCurrency(contract.bid ?? 0)} / ${formatCurrency(contract.ask ?? 0)}`, inline: true },
                { name: 'Mid', value: formatCurrency(mid), inline: true },
                { name: 'Last', value: formatCurrency(contract.lastPrice ?? 0), inline: true },
                { name: 'Implied Vol', value: formatPercentage(implied), inline: true },
                { name: 'Theo (BS)', value: formatCurrency(theo), inline: true },
                { name: 'Open Interest', value: `${contract.openInterest ?? 0}`, inline: true },
                { name: 'Breakeven @ Expiry', value: `${formatCurrency(breakeven)}`, inline: true },
                { name: 'Delta', value: formatNumber(greeks.delta, 3), inline: true },
                { name: 'Gamma', value: formatNumber(greeks.gamma, 4), inline: true },
                { name: 'Vega', value: formatNumber(greeks.vega, 2), inline: true },
                { name: 'Theta', value: formatNumber(greeks.theta, 2), inline: true },
                { name: 'Rho', value: formatNumber(greeks.rho, 2), inline: true },
            )
            .setFooter({ text: `Underlying ${formatCurrency(underlyingQuote.price)} • Expiry ${expiration}` });

        return { embed, contract, underlyingQuote };
    }

    private async resolveOptionSelection(
        interaction: ChatInputCommandInteraction,
        symbol: string,
        expiration?: string,
        strike?: number,
        right?: OptionRight,
    ): Promise<OptionSelectionResult | null> {
        const initialChain = await getOptionChain(symbol);
        const expirations = initialChain.expirationDates;
        let usedPrompts = false;

        let selectedExpiration = expiration && expirations.includes(expiration) ? expiration : undefined;
        if (!selectedExpiration) {
            const options = expirations.slice(0, 25).map(date => ({ label: date, value: date }));
            const choice = await this.promptSelect(interaction, 'Select an expiration', `quote:${interaction.id}:exp`, options);
            if (!choice) {
                await this.safeEdit(interaction, 'Timed out while waiting for expiration selection.');
                return null;
            }
            selectedExpiration = choice;
            usedPrompts = true;
        }

        let selectedRight = right ?? null;
        if (!selectedRight) {
            const choice = await this.promptSelect(interaction, 'Select option type', `quote:${interaction.id}:right`, [
                { label: 'Call', value: 'CALL' },
                { label: 'Put', value: 'PUT' },
            ]);
            if (!choice) {
                await this.safeEdit(interaction, 'Timed out while waiting for option type selection.');
                return null;
            }
            selectedRight = choice as OptionRight;
            usedPrompts = true;
        }

        const chain = await getOptionChain(symbol, selectedExpiration);
        const bucket = selectedRight === 'CALL' ? chain.calls : chain.puts;
        if (!bucket.length) {
            throw new Error('No contracts returned for the selected criteria');
        }

        const underlyingSpot = (await getQuote(symbol)).price;
        const ordered = [...bucket].sort((a, b) => Math.abs(a.strike - underlyingSpot) - Math.abs(b.strike - underlyingSpot));
        const strikeOptions = ordered.slice(0, 25).map(contract => ({
            label: `${selectedRight === 'CALL' ? 'Call' : 'Put'} ${formatNumber(contract.strike, 2)}`,
            value: contract.strike.toString(),
        }));

        let selectedStrike = strike;
        if (selectedStrike == null || !bucket.some(contract => Math.abs(contract.strike - selectedStrike!) < 1e-6)) {
            const choice = await this.promptSelect(interaction, 'Select a strike', `quote:${interaction.id}:strike`, strikeOptions);
            if (!choice) {
                await this.safeEdit(interaction, 'Timed out while waiting for strike selection.');
                return null;
            }
            selectedStrike = Number(choice);
            usedPrompts = true;
        }

        const contract = bucket.find(item => Math.abs(item.strike - selectedStrike!) < 1e-6);
        if (!contract) {
            throw new Error('Selected strike is not available for the chosen expiration/right');
        }

        if (usedPrompts) {
            await this.safeEdit(interaction, '');
        }

        return {
            expiration: selectedExpiration,
            strike: selectedStrike!,
            right: selectedRight as OptionRight,
            contract,
            usedPrompts,
        };
    }

    private async promptSelect(
        interaction: ChatInputCommandInteraction,
        prompt: string,
        customId: string,
        options: { label: string; value: string }[],
    ): Promise<string | null> {
        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(customId)
                .setPlaceholder(prompt)
                .addOptions(options),
        );

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: prompt, components: [row], embeds: [], files: [] });
        } else {
            await interaction.reply({ content: prompt, components: [row], ephemeral: true });
        }

        return new Promise(resolve => {
            const filter = (i: Interaction) => i.isStringSelectMenu() && i.customId === customId && i.user.id === interaction.user.id;
            const collector = interaction.channel?.createMessageComponentCollector({ filter, max: 1, time: 60_000 });
           if (!collector) {
               resolve(null);
               return;
           }
            collector.on('collect', async select => {
                if (!select.isStringSelectMenu()) return;
                await select.deferUpdate();
                resolve(select.values[0]);
            });
            collector.on('end', collected => {
                if (collected.size === 0) {
                    resolve(null);
                }
            });
        });
    }

    private buildTimeframeButtons(interactionId: string, current: TimeframeKey) {
        const buttons = new ActionRowBuilder<ButtonBuilder>();
        const options: TimeframeKey[] = ['DAY', 'WEEK', 'MONTH', 'YTD'];
        for (const key of options) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`quote:${interactionId}:${key}`)
                    .setLabel(this.timeframeLabel(key))
                    .setStyle(key === current ? ButtonStyle.Primary : ButtonStyle.Secondary),
            );
        }
        return buttons;
    }

    private buildOptionActionRow(
        interactionId: string,
        option: { symbol: string; expiration: string; strike: number; right: OptionRight },
    ) {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`quoteAction:${interactionId}:BUY:${option.symbol}:${option.expiration}:${option.right}:${option.strike}`)
                .setLabel('Buy Option')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`quoteAction:${interactionId}:SELL:${option.symbol}:${option.expiration}:${option.right}:${option.strike}`)
                .setLabel('Sell Option')
                .setStyle(ButtonStyle.Danger),
        );
    }

    private timeframeLabel(key: TimeframeKey): string {
        switch (key) {
            case 'DAY': return '1 Day';
            case 'WEEK': return '1 Week';
            case 'MONTH': return '1 Month';
            case 'YTD': return 'Year to Date';
            default: return key;
        }
    }

    private registerOptionActions(
        interaction: ChatInputCommandInteraction,
        option: { symbol: string; expiration: string; strike: number; right: OptionRight },
    ) {
        const filter = (i: Interaction) => i.isButton()
            && i.customId.startsWith(`quoteAction:${interaction.id}`)
            && i.user.id === interaction.user.id;
        const collector = interaction.channel?.createMessageComponentCollector({ filter, time: 120_000 });

        collector?.on('collect', async (btn: ButtonInteraction) => {
            const [, , action, symbol, expiration, right, strikeStr] = btn.customId.split(':');
            const strike = Number(strikeStr);
            await this.handleOptionOrderAction(
                interaction,
                btn,
                {
                    action: action as 'BUY' | 'SELL',
                    symbol,
                    expiration,
                    right: right as OptionRight,
                    strike,
                },
            );
        });
    }

    private registerCollector(
        interaction: ChatInputCommandInteraction,
        renderProvider: (tf: TimeframeKey) => Promise<{ attachment: AttachmentBuilder; embed: EmbedBuilder }>,
        initial: TimeframeKey,
        baseRows: ActionRowBuilder<ButtonBuilder>[] = [],
    ) {
        const filter = (i: Interaction) => i.isButton() && i.customId.startsWith(`quote:${interaction.id}`) && i.user.id === interaction.user.id;
        const collector = interaction.channel?.createMessageComponentCollector({ filter, time: 90_000 });
        let current = initial;

        collector?.on('collect', async (btn: ButtonInteraction) => {
            await btn.deferUpdate();
            const [, , timeframeKey] = btn.customId.split(':') as [string, string, TimeframeKey];
            current = timeframeKey;
            const rendered = await renderProvider(current);
            const buttons = this.buildTimeframeButtons(interaction.id, current);
            await btn.editReply({ embeds: [rendered.embed], files: [rendered.attachment], components: [buttons, ...baseRows] });
        });

        collector?.on('end', async () => {
            interaction.editReply({ components: baseRows }).catch(() => undefined);
        });
    }

    private async handleOptionOrderAction(
        baseInteraction: ChatInputCommandInteraction,
        button: ButtonInteraction,
        details: { action: 'BUY' | 'SELL'; symbol: string; expiration: string; right: OptionRight; strike: number },
    ) {
        const modalId = `quoteModal:${baseInteraction.id}:${details.action}:${details.symbol}:${details.expiration}:${details.right}:${details.strike}`;
        const quantityInput = new TextInputBuilder()
            .setCustomId('quantity')
            .setLabel('Contracts')
            .setStyle(TextInputStyle.Short)
            .setValue('1');
        const limitInput = new TextInputBuilder()
            .setCustomId('limit')
            .setLabel('Limit price (blank = market)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle(`${details.action} ${details.symbol} option`)
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput),
                new ActionRowBuilder<TextInputBuilder>().addComponents(limitInput),
            );

        await button.showModal(modal);

        let submission;
        try {
            submission = await button.awaitModalSubmit({
                time: 60_000,
                filter: (inter) => inter.customId === modalId && inter.user.id === baseInteraction.user.id,
            });
        } catch (error) {
            return;
        }

        const qtyValue = submission.fields.getTextInputValue('quantity') ?? '1';
        const limitValue = submission.fields.getTextInputValue('limit') ?? '';

        const quantity = Number.parseInt(qtyValue, 10);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            await submission.reply({ ephemeral: true, content: '❗ Quantity must be a positive integer.' });
            return;
        }

        const trimmedLimit = limitValue.trim();
        const limitPrice = trimmedLimit.length ? Number(trimmedLimit) : undefined;
        if (limitPrice != null && (!Number.isFinite(limitPrice) || limitPrice <= 0)) {
            await submission.reply({ ephemeral: true, content: '❗ Limit price must be a positive number.' });
            return;
        }

        const request = {
            assetType: 'OPTION' as const,
            symbol: details.symbol,
            quantity,
            price: limitPrice,
            expiration: details.expiration,
            strike: details.strike,
            right: details.right,
            userId: baseInteraction.user.id,
            limitOrder: limitPrice != null,
        };

        try {
            const outcome: TradeResultOrOrder = details.action === 'BUY'
                ? await executeBuy(request)
                : await executeSell(request);

            if (outcome.kind === 'filled') {
                const embed = buildTradeEmbed(baseInteraction, outcome.execution, details.action);
                await submission.reply({ ephemeral: true, embeds: [embed] });
            } else {
                const order = outcome.order;
                const comparator = details.action === 'BUY' ? '≤' : '≥';
                await submission.reply({
                    ephemeral: true,
                    content: `🕒 Limit order placed: ${details.action} ${order.symbol} ${order.expiration} ${order.right} ${order.strike} @ ${comparator} ${order.limitPrice.toFixed(2)} (qty ${order.quantity}).`,
                });
            }
        } catch (error: any) {
            await submission.reply({ ephemeral: true, content: `❌ Order failed: ${error.message ?? error}` });
        }
    }

    private async renderDetailedChart(
        interaction: ChatInputCommandInteraction,
        cacheKeyPrefix: string,
        symbol: string,
        timeframe: TimeframeKey,
        baseEmbed: EmbedBuilder,
        footerNote: string,
    ) {
        const cacheKey = `${cacheKeyPrefix}:${timeframe}`;
        let entry = chartCache.get(cacheKey);
        if (!entry || entry.expires < Date.now()) {
            const chartData = await this.fetchChartData(symbol, timeframe);
            const buffer = await this.buildChartImage(symbol, chartData.timestamps, chartData.prices, timeframe);
            entry = { buffer, expires: Date.now() + CHART_CACHE_TTL };
            chartCache.set(cacheKey, entry);
        }

        const filename = `${cacheKey.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        const attachment = new AttachmentBuilder(entry.buffer, { name: filename });
        const embed = EmbedBuilder.from(baseEmbed)
            .setImage(`attachment://${filename}`)
            .setFooter({ text: `Timeframe: ${this.timeframeLabel(timeframe)}${footerNote ? ` • ${footerNote}` : ''} • Requested by ${interaction.user.username}` });

        return { attachment, embed };
    }

    private async fetchChartData(symbol: string, timeframe: TimeframeKey) {
        const now = Date.now();
        let period1: number;
        let interval: string;
        switch (timeframe) {
            case 'DAY':
                period1 = now - 7 * 24 * 60 * 60 * 1000;
                interval = '1d';
                break;
            case 'WEEK':
                period1 = now - 7 * 24 * 60 * 60 * 1000;
                interval = '1d';
                break;
            case 'MONTH':
                period1 = now - 30 * 24 * 60 * 60 * 1000;
                interval = '1d';
                break;
            case 'YTD':
                const startOfYear = new Date(new Date().getUTCFullYear(), 0, 1).getTime();
                period1 = startOfYear;
                interval = '1d';
                break;
            default:
                period1 = now - 7 * 24 * 60 * 60 * 1000;
                interval = '1d';
        }

        const result = await yahooFinance.historical(symbol, {
            period1: new Date(period1),
            period2: new Date(now),
            interval: interval as any,
        });

        const timestamps = result.map(row => row.date.getTime());
        const prices = result.map(row => row.close);
        if (!timestamps.length || !prices.length) {
            throw new Error('Historical data unavailable for chart');
        }
        return { timestamps, prices };
    }

    private async buildChartImage(symbol: string, timestamps: number[], prices: number[], timeframe: TimeframeKey) {
        const labels = timestamps.map(ts => {
            const date = new Date(ts);
            if (timeframe === 'DAY') {
                return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            }
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const trace = {
            x: labels,
            y: prices,
            type: 'scatter',
            mode: 'lines',
            line: {
                color: '#4fd1c5',
                width: 4,
            },
            fill: 'tozeroy',
            fillcolor: 'rgba(79, 209, 197, 0.15)',
        };

        const layout = {
            title: {
                text: `${symbol} Price`,
                font: { color: '#ffffff' },
            },
            paper_bgcolor: '#2f3136',
            plot_bgcolor: '#2f3136',
            margin: { l: 60, r: 30, t: 50, b: 50 },
            xaxis: {
                tickfont: { color: '#d1d5db' },
                gridcolor: 'rgba(255,255,255,0.08)',
                showgrid: true,
                zeroline: false,
            },
            yaxis: {
                tickfont: { color: '#d1d5db' },
                gridcolor: 'rgba(255,255,255,0.08)',
                zeroline: false,
            },
        };

        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
              <meta charset="utf-8">
              <title>Plotly Chart</title>
              <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
          </head>
          <body style="margin:0; padding:0; background-color:#2f3136;">
              <div id="plot" style="width:1200px; height:650px;"></div>
              <script>
                  const trace = ${JSON.stringify(trace)};
                  const layout = ${JSON.stringify(layout)};
                  Plotly.newPlot('plot', [trace], layout, {displayModeBar: false}).then(() => {
                      window.chartReady = true;
                  });
              </script>
          </body>
          </html>
        `;

        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        try {
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            await page.waitForFunction('window.chartReady === true', { timeout: 60_000 });
            const plotElement = await page.$('#plot');
            if (!plotElement) {
                throw new Error('Chart rendering failed');
            }
            const buffer = await plotElement.screenshot({ omitBackground: true }) as Buffer;
            return buffer;
        } finally {
            await browser.close();
        }
    }

    private async safeEdit(interaction: ChatInputCommandInteraction, content: string) {
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content, components: [] });
            } else {
                await interaction.reply({ content, ephemeral: true });
            }
        } catch (error) {
            // ignore
        }
    }
}
