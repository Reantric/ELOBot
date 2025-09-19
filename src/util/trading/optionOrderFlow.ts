import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
} from 'discord.js';
import type { InteractionCollector } from 'discord.js';

import { getOptionChain, getQuote } from './marketData.js';
import type { OptionContractQuote, OptionRight, TradeSide } from './types.js';
import type { OptionTradeRequest, TradeResultOrOrder } from './trades.js';
import { formatCurrency, formatNumber, formatPercentage, buildTradeEmbed } from './view.js';
import { describePendingOrder } from './messages.js';

interface OptionOrderFlowConfig {
    interaction: ChatInputCommandInteraction;
    side: TradeSide;
    symbol: string;
    quantity: number;
    limitPrice?: number;
    limitOrder: boolean;
    execute: (request: OptionTradeRequest) => Promise<TradeResultOrOrder>;
}

interface SelectionState {
    expiration?: string;
    right?: OptionRight;
    page: number;
}

interface CachedChain {
    calls: OptionContractQuote[];
    puts: OptionContractQuote[];
}

const STRIKES_PER_PAGE = 10;
const BUTTONS_PER_ROW = 5;
const COLLECTOR_TIMEOUT_MS = 120_000;

export class OptionOrderFlow {
    private readonly baseId: string;
    private readonly chainCache = new Map<string, CachedChain>();
    private readonly config: OptionOrderFlowConfig;
    private readonly state: SelectionState = { page: 0 };

    private expirations: string[] = [];
    private contracts: OptionContractQuote[] = [];
    private totalPages = 0;
    private underlyingPrice = 0;
    private active = true;
    private collector: InteractionCollector<any> | null = null;
    private refreshTimer: NodeJS.Timeout | null = null;
    private refreshing = false;

    constructor(config: OptionOrderFlowConfig) {
        this.config = config;
        this.baseId = `opttrade:${config.interaction.id}`;
    }

    async run(): Promise<void> {
        await this.bootstrap();
        await this.updateMessage();
        this.startAutoRefresh();
        await this.collectInteractions();
    }

    private async bootstrap(): Promise<void> {
        const { symbol } = this.config;
        const initialChain = await getOptionChain(symbol);
        this.expirations = initialChain.expirationDates.slice(0, 25);
        if (this.expirations.length === 0) {
            throw new Error(`No listed option expirations found for ${symbol}.`);
        }

        this.chainCache.set(this.expirations[0], {
            calls: initialChain.calls,
            puts: initialChain.puts,
        });

        this.state.expiration = this.expirations[0];
        this.state.right = 'CALL';

        this.underlyingPrice = (await getQuote(symbol)).price;
        await this.refreshContracts();
    }

    private async collectInteractions(): Promise<void> {
        return new Promise(resolve => {
            const filter = (component: any) =>
                component.user.id === this.config.interaction.user.id
                && component.customId.startsWith(this.baseId);

            const collector = this.config.interaction.channel?.createMessageComponentCollector({
                filter,
                time: COLLECTOR_TIMEOUT_MS,
            });

            if (!collector) {
                resolve();
                return;
            }

            this.collector = collector;

            collector.on('collect', async interaction => {
                this.bumpRefreshTimer();
                if (!this.active) {
                    await interaction.deferUpdate();
                    return;
                }

                if (interaction.isStringSelectMenu()) {
                    await this.handleSelect(interaction);
                    return;
                }

                if (interaction.isButton()) {
                    await this.handleButton(interaction);
                }
            });

            collector.on('end', async (_collected, reason) => {
                this.collector = null;
                this.stopAutoRefresh();
                if (this.active) {
                    this.active = false;
                    const message = reason === 'time'
                        ? '⌛ Option order selection timed out.'
                        : undefined;
                    await this.disableComponents(message);
                }
                resolve();
            });
        });
    }

    private async handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
        const [, , kind] = interaction.customId.split(':');
        await interaction.deferUpdate();
        if (kind === 'expiry') {
            this.state.expiration = interaction.values[0];
            this.state.page = 0;
            await this.refreshContracts(true);
        } else if (kind === 'right') {
            this.state.right = interaction.values[0] as OptionRight;
            this.state.page = 0;
            await this.refreshContracts(true);
        }
        await this.updateMessage();
    }

    private async handleButton(interaction: ButtonInteraction): Promise<void> {
        const parts = interaction.customId.split(':');
        const action = parts[2];
        switch (action) {
            case 'strike':
                await interaction.deferUpdate();
                await this.executeOrder(Number(parts[3]));
                break;
            case 'page':
                await interaction.deferUpdate();
                this.handlePageChange(parts[3]);
                await this.updateMessage();
                break;
            case 'cancel':
                this.active = false;
                await interaction.update({ content: '❌ Option order cancelled.', components: [], embeds: [] });
                this.collector?.stop('cancelled');
                break;
            default:
                await interaction.deferUpdate();
        }
    }

    private handlePageChange(direction: string): void {
        if (!this.contracts.length) return;
        const lastPage = Math.max(0, this.totalPages - 1);
        if (direction === 'prev') {
            this.state.page = Math.max(0, this.state.page - 1);
        } else if (direction === 'next') {
            this.state.page = Math.min(lastPage, this.state.page + 1);
        }
    }

    private startAutoRefresh(): void {
        this.stopAutoRefresh();
        this.refreshTimer = setInterval(() => {
            void this.tickRefresh();
        }, 5000);
    }

    private stopAutoRefresh(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    private bumpRefreshTimer(): void {
        if (!this.refreshTimer) {
            return;
        }
        this.stopAutoRefresh();
        this.startAutoRefresh();
    }

    private async tickRefresh(): Promise<void> {
        if (!this.active || this.refreshing) {
            return;
        }
        this.refreshing = true;
        try {
            this.underlyingPrice = (await getQuote(this.config.symbol)).price;
            await this.refreshContracts();
            await this.updateMessage();
        } catch (error) {
            // ignore transient errors
        } finally {
            this.refreshing = false;
        }
    }

    private async executeOrder(strike: number): Promise<void> {
        if (!this.state.expiration || !this.state.right) {
            return;
        }
        const contract = this.contracts.find(item => Math.abs(item.strike - strike) < 1e-6);
        if (!contract) {
            return;
        }

        this.active = false;
        this.stopAutoRefresh();

        const request: OptionTradeRequest = {
            userId: this.config.interaction.user.id,
            assetType: 'OPTION',
            symbol: this.config.symbol,
            quantity: this.config.quantity,
            price: this.config.limitPrice,
            expiration: this.state.expiration,
            strike: contract.strike,
            right: this.state.right,
            limitOrder: this.config.limitOrder && this.config.limitPrice != null,
        };

        try {
            const outcome = await this.config.execute(request);
            if (outcome.kind === 'filled') {
                const embed = buildTradeEmbed(this.config.interaction, outcome.execution, this.config.side);
                await this.config.interaction.editReply({ embeds: [embed], components: [], content: '' });
            } else {
                const message = describePendingOrder(outcome.order, this.config.side);
                await this.config.interaction.editReply({ content: message, components: [], embeds: [] });
            }
        } catch (error: any) {
            await this.config.interaction.editReply({
                content: `❌ Failed to submit option order: ${error?.message ?? String(error)}`,
                components: [],
                embeds: [],
            });
        } finally {
            this.collector?.stop('completed');
        }
    }

    private async updateMessage(): Promise<void> {
        const embed = this.buildEmbed();
        const components = this.buildComponents();
        await this.config.interaction.editReply({ content: '', embeds: [embed], components });
    }

    private buildEmbed(): EmbedBuilder {
        const { side, symbol, quantity, limitPrice } = this.config;
        const comparator = side === 'BUY' ? '≤' : '≥';
        const limitLabel = limitPrice != null ? `${comparator} ${formatCurrency(limitPrice)}` : 'Market';
        const embed = new EmbedBuilder()
            .setTitle(`${side === 'BUY' ? 'Buy' : 'Sell'} ${symbol} options`)
            .setColor(side === 'BUY' ? 0x2ecc71 : 0xe74c3c)
            .addFields(
                { name: 'Expiration', value: this.state.expiration ?? 'Select from dropdown', inline: true },
                { name: 'Right', value: this.state.right ?? 'Select from dropdown', inline: true },
                { name: 'Quantity', value: `${quantity}`, inline: true },
                { name: 'Limit', value: limitLabel, inline: true },
                { name: 'Underlying', value: formatCurrency(this.underlyingPrice), inline: true },
            );

        if (this.contracts.length > 0) {
            const start = this.state.page * STRIKES_PER_PAGE;
            const current = this.contracts.slice(start, start + STRIKES_PER_PAGE);
            const totalPages = Math.max(1, this.totalPages);
            const lines = current.map(contract => {
                const mid = contract.midpoint ?? contract.lastPrice ?? contract.bid ?? contract.ask ?? 0;
                const iv = contract.impliedVolatility ?? 0;
                return `${formatNumber(contract.strike, 2)} • Mid ${formatCurrency(mid)} • IV ${formatPercentage(iv)}`;
            });
            embed.addFields({
                name: `Strikes (page ${this.state.page + 1}/${totalPages})`,
                value: lines.join('\n') || 'No strikes available for this selection.',
            });
        } else {
            embed.setDescription('Choose an expiration and option type to view strikes.');
        }

        return embed;
    }

    private buildComponents() {
        const rows: ActionRowBuilder<any>[] = [];

        const expirationOptions = this.expirations.map(date => ({
            label: date,
            value: date,
            default: date === this.state.expiration,
        }));
        const expSelect = new StringSelectMenuBuilder()
            .setCustomId(`${this.baseId}:expiry`)
            .setPlaceholder('Select expiration')
            .addOptions(expirationOptions);
        rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(expSelect));

        const rightSelect = new StringSelectMenuBuilder()
            .setCustomId(`${this.baseId}:right`)
            .setPlaceholder('Select option type')
            .addOptions(
                { label: 'Call', value: 'CALL', default: this.state.right === 'CALL' },
                { label: 'Put', value: 'PUT', default: this.state.right === 'PUT' },
            );
        rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(rightSelect));

        if (this.contracts.length > 0 && this.state.expiration && this.state.right) {
            const start = this.state.page * STRIKES_PER_PAGE;
            const current = this.contracts.slice(start, start + STRIKES_PER_PAGE);

            for (let i = 0; i < current.length; i += BUTTONS_PER_ROW) {
                const slice = current.slice(i, i + BUTTONS_PER_ROW);
                const row = new ActionRowBuilder<ButtonBuilder>();
                for (const contract of slice) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`${this.baseId}:strike:${contract.strike}`)
                            .setLabel(formatNumber(contract.strike, 2))
                            .setStyle(ButtonStyle.Secondary),
                    );
                }
                rows.push(row);
            }

            const navRow = new ActionRowBuilder<ButtonBuilder>();
            const lastPage = Math.max(0, this.totalPages - 1);
            navRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`${this.baseId}:page:prev`)
                    .setLabel('Prev')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(this.state.page === 0),
                new ButtonBuilder()
                    .setCustomId(`${this.baseId}:page:next`)
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(this.state.page >= lastPage),
                new ButtonBuilder()
                    .setCustomId(`${this.baseId}:cancel`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger),
            );
            rows.push(navRow);
        }

        return rows.slice(0, 5);
    }

    private async refreshContracts(forceQuote = false): Promise<void> {
        if (!this.state.expiration) {
            this.contracts = [];
            this.totalPages = 0;
            return;
        }

        if (forceQuote) {
            try {
                this.underlyingPrice = (await getQuote(this.config.symbol)).price;
            } catch (error) {
                // ignore quote refresh issues
            }
        }

        const cacheKey = this.state.expiration;
        let chain = this.chainCache.get(cacheKey);
        if (!chain) {
            const fetched = await getOptionChain(this.config.symbol, this.state.expiration);
            chain = { calls: fetched.calls, puts: fetched.puts };
            this.chainCache.set(cacheKey, chain);
        }
        const bucket = (this.state.right === 'PUT' ? chain.puts : chain.calls) ?? [];
        this.contracts = [...bucket].sort((a, b) => a.strike - b.strike);
        this.totalPages = Math.ceil(this.contracts.length / STRIKES_PER_PAGE);
        const lastPage = Math.max(0, this.totalPages - 1);
        this.state.page = Math.min(this.state.page, lastPage);
    }

    private async disableComponents(message?: string): Promise<void> {
        this.stopAutoRefresh();
        await this.config.interaction.editReply({
            content: message ?? undefined,
            components: [],
        }).catch(() => undefined);
    }
}
