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
} from 'discord.js';
import puppeteer from 'puppeteer';
import yahooFinance from 'yahoo-finance2';

import { IBotInteraction } from '../api/capi';
import { getQuote } from '../util/trading/marketData.js';
import { formatCurrency, formatPercentage, formatTimestamp } from '../util/trading/view.js';

type TimeframeKey = 'DAY' | 'WEEK' | 'MONTH' | 'YTD';

interface ChartCacheEntry {
    buffer: Buffer;
    expires: number;
    prices: number[];
}

const chartCache = new Map<string, ChartCacheEntry>();
const CHART_CACHE_TTL = 60_000;
const QUOTE_REFRESH_INTERVAL_MS = 20_000;
const QUOTE_REFRESH_MAX_TICKS = 100;

export default class Quote implements IBotInteraction {
    private readonly quoteRefreshTimers = new Map<string, NodeJS.Timeout>();

    name(): string {
        return 'quote';
    }

    help(): string {
        return 'Get the latest quote for a stock';
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
            .addBooleanOption(option => option.setName('detailed').setDescription('Include interactive price chart'));
    }

    async runCommand(interaction: ChatInputCommandInteraction, _Bot: Client): Promise<void> {
        const symbol = interaction.options.getString('symbol', true).toUpperCase();
        const detailed = interaction.options.getBoolean('detailed') ?? false;
        try {
            await interaction.deferReply();
            const baseEmbed = await this.equityQuote(symbol);

            if (!detailed) {
                await interaction.editReply({ embeds: [baseEmbed], components: [] });
                this.scheduleQuoteRefresh(interaction, async () => {
                    const updated = await this.equityQuote(symbol);
                    await interaction.editReply({ embeds: [updated], components: [] });
                });
                return;
            }

            try {
                let currentPriceEmbed = baseEmbed;
                let currentTimeframe: TimeframeKey = 'DAY';
                const renderProvider = async (timeframe: TimeframeKey) => this.renderDetailedChart(
                    interaction,
                    `EQUITY:${symbol}`,
                    symbol,
                    timeframe,
                    currentPriceEmbed,
                    'Regular-hours price'
                );

                let chartState = await renderProvider(currentTimeframe);
                let timeframeButtons = this.buildTimeframeButtons(interaction.id, currentTimeframe);
                let currentComponents: ActionRowBuilder<ButtonBuilder>[] = [timeframeButtons];

                await interaction.editReply({
                    embeds: [currentPriceEmbed, chartState.embed],
                    files: [chartState.attachment],
                    components: currentComponents,
                });

                const filter = (i: Interaction) => i.isButton()
                    && i.customId.startsWith(`quote:${interaction.id}`)
                    && i.user.id === interaction.user.id;
                const collector = interaction.channel?.createMessageComponentCollector({ filter, time: 90_000 });

                collector?.on('collect', async btn => {
                    await btn.deferUpdate();
                    const [, , timeframeKey] = btn.customId.split(':') as [string, string, TimeframeKey];
                    currentTimeframe = timeframeKey;
                    chartState = await renderProvider(currentTimeframe);
                    timeframeButtons = this.buildTimeframeButtons(interaction.id, currentTimeframe);
                    currentComponents = [timeframeButtons];
                    await interaction.editReply({
                        embeds: [currentPriceEmbed, chartState.embed],
                        files: [chartState.attachment],
                        components: currentComponents,
                    });
                });

                collector?.on('end', async () => {
                    await interaction.editReply({ components: currentComponents }).catch(() => undefined);
                });

                this.scheduleQuoteRefresh(interaction, async () => {
                    currentPriceEmbed = await this.equityQuote(symbol);
                    await interaction.editReply({ embeds: [currentPriceEmbed, chartState.embed], components: currentComponents });
                });
            } catch (error) {
                await interaction.editReply({ embeds: [baseEmbed], content: `⚠️ Chart unavailable: ${String(error)}`, components: [] });
            }
        } catch (error: any) {
            const message = error?.message ?? String(error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Failed to fetch quote: ${message}`, embeds: [], components: [] });
            } else {
                await interaction.reply({ content: `❌ Failed to fetch quote: ${message}` });
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

    private timeframeLabel(key: TimeframeKey): string {
        switch (key) {
            case 'DAY': return '1 Day';
            case 'WEEK': return '1 Week';
            case 'MONTH': return '1 Month';
            case 'YTD': return 'Year to Date';
            default: return key;
        }
    }

    private async renderDetailedChart(
        interaction: ChatInputCommandInteraction,
        cacheKeyPrefix: string,
        symbol: string,
        timeframe: TimeframeKey,
        baseEmbed: EmbedBuilder,
        footerNote: string,
    ): Promise<{ attachment: AttachmentBuilder; embed: EmbedBuilder; totalReturn: number }> {
        const cacheKey = `${cacheKeyPrefix}:${timeframe}`;
        let entry = chartCache.get(cacheKey);
        let prices: number[];
        if (!entry || entry.expires < Date.now()) {
            const chartData = await this.fetchChartData(symbol, timeframe);
            const buffer = await this.buildChartImage(symbol, chartData.timestamps, chartData.prices, timeframe);
            entry = { buffer, expires: Date.now() + CHART_CACHE_TTL, prices: chartData.prices };
            chartCache.set(cacheKey, entry);
            prices = chartData.prices;
        } else {
            prices = entry.prices;
            if (!prices || prices.length === 0) {
                const chartData = await this.fetchChartData(symbol, timeframe);
                prices = chartData.prices;
                entry.prices = prices;
                chartCache.set(cacheKey, entry);
            }
        }

        const filename = `${cacheKey.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        const attachment = new AttachmentBuilder(entry.buffer, { name: filename });
        const first = prices.find(price => Number.isFinite(price) && price > 0) ?? prices[0];
        const last = [...prices].reverse().find(price => Number.isFinite(price) && price > 0) ?? prices[prices.length - 1];
        const totalReturn = first && first > 0 && last ? (last - first) / first : 0;

        const embed = new EmbedBuilder()
            .setTitle(`${symbol} • ${this.timeframeLabel(timeframe)}`)
            .setColor(baseEmbed.data?.color ?? 0x3498db)
            .addFields({ name: 'Total Return', value: formatPercentage(totalReturn), inline: true })
            .setImage(`attachment://${filename}`)
            .setFooter({ text: `Timeframe: ${this.timeframeLabel(timeframe)}${footerNote ? ` • ${footerNote}` : ''} • Requested by ${interaction.user.username}` });

        return { attachment, embed, totalReturn };
    }

    private async fetchChartData(symbol: string, timeframe: TimeframeKey) {
        const now = Date.now();
        let period1: number;
        let interval: string;
        switch (timeframe) {
            case 'DAY':
                period1 = now - 24 * 60 * 60 * 1000;
                interval = '5m';
                break;
            case 'WEEK':
                period1 = now - 7 * 24 * 60 * 60 * 1000;
                interval = '1h';
                break;
            case 'MONTH':
                period1 = now - 30 * 24 * 60 * 60 * 1000;
                interval = '1h';
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

        const result = await yahooFinance.chart(symbol, {
            period1: new Date(period1),
            period2: new Date(now),
            interval: interval as any,
            includePrePost: true,
        });

        const quotes = result?.quotes ?? [];
        const points = quotes.map(row => {
            const price = row.close ?? row.adjclose ?? row.open ?? row.high ?? row.low;
            return {
                timestamp: row.date.getTime(),
                price: price ?? NaN,
            };
        }).filter(point => Number.isFinite(point.price));

        const timestamps = points.map(point => point.timestamp);
        const prices = points.map(point => point.price);
        const validPoints = timestamps.length > 0 && prices.some(price => price > 0);
        if (!validPoints) {
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

    private scheduleQuoteRefresh(
        interaction: ChatInputCommandInteraction,
        updateFn: () => Promise<void>,
    ): void {
        this.clearQuoteRefresh(interaction.id);
        let ticks = 0;
        const timer = setInterval(async () => {
            ticks += 1;
            try {
                await updateFn();
            } catch (error) {
                // ignore transient failures
            }
            if (ticks >= QUOTE_REFRESH_MAX_TICKS) {
                this.clearQuoteRefresh(interaction.id);
            }
        }, QUOTE_REFRESH_INTERVAL_MS);
        this.quoteRefreshTimers.set(interaction.id, timer);
    }

    private clearQuoteRefresh(interactionId: string): void {
        const timer = this.quoteRefreshTimers.get(interactionId);
        if (timer) {
            clearInterval(timer);
            this.quoteRefreshTimers.delete(interactionId);
        }
    }

}
