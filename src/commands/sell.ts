import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, Client } from 'discord.js';
import { IBotInteraction } from '../api/capi';
import { OptionOrderFlow } from '../util/trading/optionOrderFlow.js';
import { describePendingOrder } from '../util/trading/messages.js';
import { executeSell } from '../util/trading/trades.js';
import type { EquityTradeRequest, TradeResultOrOrder } from '../util/trading/trades.js';
import { buildTradeEmbed } from '../util/trading/view.js';

export default class Sell implements IBotInteraction {
    name(): string {
        return 'sell';
    }

    help(): string {
        return 'Sell shares or option contracts you hold';
    }

    cooldown(): number {
        return 5;
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
            .addSubcommand(sub => sub
                .setName('stock')
                .setDescription('Place a stock sell order')
                .addStringOption(option => option
                    .setName('symbol')
                    .setDescription('Ticker symbol (e.g., AAPL)')
                    .setRequired(true))
                .addIntegerOption(option => option
                    .setName('quantity')
                    .setDescription('Number of shares to sell')
                    .setMinValue(1)
                    .setRequired(true))
                .addNumberOption(option => option
                    .setName('limit')
                    .setDescription('Limit price per share')
                    .setMinValue(0.01)
                    .setRequired(true)))
            .addSubcommand(sub => sub
                .setName('option')
                .setDescription('Place an option sell order')
                .addStringOption(option => option
                    .setName('symbol')
                    .setDescription('Underlying ticker symbol')
                    .setRequired(true))
                .addIntegerOption(option => option
                    .setName('quantity')
                    .setDescription('Number of option contracts')
                    .setMinValue(1)
                    .setRequired(true))
                .addNumberOption(option => option
                    .setName('limit')
                    .setDescription('Optional limit price per contract')
                    .setMinValue(0.01)));
    }

    async runCommand(interaction: ChatInputCommandInteraction, _Bot: Client): Promise<void> {
        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply();

        if (subcommand === 'stock') {
            await this.handleStock(interaction);
            return;
        }

        await this.handleOption(interaction);
    }

    private async handleStock(interaction: ChatInputCommandInteraction): Promise<void> {
        const symbol = interaction.options.getString('symbol', true).toUpperCase();
        const quantity = interaction.options.getInteger('quantity', true);
        const limit = interaction.options.getNumber('limit', true);

        if (quantity <= 0 || !Number.isFinite(quantity)) {
            await interaction.editReply({ content: '❗ Quantity must be a positive integer.' });
            return;
        }
        if (!Number.isFinite(limit) || limit <= 0) {
            await interaction.editReply({ content: '❗ Limit price must be a positive number.' });
            return;
        }

        const request: EquityTradeRequest = {
            userId: interaction.user.id,
            assetType: 'EQUITY',
            symbol,
            quantity,
            price: limit,
            limitOrder: true,
        };

        try {
            const outcome = await executeSell(request);
            await this.respondWithOutcome(interaction, outcome, 'SELL');
        } catch (error: any) {
            await interaction.editReply({ content: `❌ Failed to execute trade: ${error?.message ?? error}` });
        }
    }

    private async handleOption(interaction: ChatInputCommandInteraction): Promise<void> {
        const symbol = interaction.options.getString('symbol', true).toUpperCase();
        const quantity = interaction.options.getInteger('quantity', true);
        const limit = interaction.options.getNumber('limit') ?? undefined;

        if (quantity <= 0 || !Number.isFinite(quantity)) {
            await interaction.editReply({ content: '❗ Quantity must be a positive integer.' });
            return;
        }

        const flow = new OptionOrderFlow({
            interaction,
            side: 'SELL',
            symbol,
            quantity,
            limitPrice: limit,
            limitOrder: limit != null,
            execute: executeSell,
        });

        try {
            await flow.run();
        } catch (error: any) {
            await interaction.editReply({ content: `❌ Failed to prepare option order: ${error?.message ?? error}` });
        }
    }

    private async respondWithOutcome(
        interaction: ChatInputCommandInteraction,
        outcome: TradeResultOrOrder,
        side: 'BUY' | 'SELL',
    ): Promise<void> {
        if (outcome.kind === 'filled') {
            const embed = buildTradeEmbed(interaction, outcome.execution, side);
            await interaction.editReply({ embeds: [embed], content: '', components: [] });
            return;
        }

        const message = describePendingOrder(outcome.order, side);
        await interaction.editReply({ content: message, embeds: [], components: [] });
    }
}
