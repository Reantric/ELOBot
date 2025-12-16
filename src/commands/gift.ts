import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, Client, EmbedBuilder, User } from 'discord.js';

import { IBotInteraction } from '../api/capi';
import { ensureAccount, saveAccount, positionKey, upsertPosition } from '../util/trading/dataStore.js';
import type { EquityPosition, OptionPosition } from '../util/trading/types.js';
import { getQuote } from '../util/trading/marketData.js';
import { formatCurrency, formatNumber } from '../util/trading/view.js';

export default class Gift implements IBotInteraction {
    name(): string {
        return 'gift';
    }

    help(): string {
        return 'Gift paper-trading assets to another user';
    }

    cooldown(): number {
        return 5;
    }

    perms(): 'admin' | 'user' | 'both' {
        return 'admin';
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
                .setDescription('Gift shares of stock to a user')
                .addUserOption(option => option
                    .setName('target')
                    .setDescription('User receiving the shares')
                    .setRequired(true))
                .addStringOption(option => option
                    .setName('symbol')
                    .setDescription('Ticker symbol (e.g., AAPL)')
                    .setRequired(true))
                .addIntegerOption(option => option
                    .setName('quantity')
                    .setDescription('Number of shares to gift')
                    .setMinValue(1)
                    .setRequired(true)))
            .addSubcommand(sub => sub
                .setName('option')
                .setDescription('Gift option contracts to a user')
                .addUserOption(option => option
                    .setName('target')
                    .setDescription('User receiving the option contracts')
                    .setRequired(true))
                .addStringOption(option => option
                    .setName('symbol')
                    .setDescription('Underlying ticker symbol')
                    .setRequired(true))
                .addStringOption(option => option
                    .setName('expiration')
                    .setDescription('Expiration date YYYY-MM-DD')
                    .setRequired(true))
                .addNumberOption(option => option
                    .setName('strike')
                    .setDescription('Strike price')
                    .setMinValue(0.01)
                    .setRequired(true))
                .addStringOption(option => option
                    .setName('type')
                    .setDescription('Option type')
                    .addChoices(
                        { name: 'Call', value: 'CALL' },
                        { name: 'Put', value: 'PUT' },
                    )
                    .setRequired(true))
                .addIntegerOption(option => option
                    .setName('quantity')
                    .setDescription('Number of option contracts')
                    .setMinValue(1)
                    .setRequired(true)));
    }

    async runCommand(interaction: ChatInputCommandInteraction, _Bot: Client): Promise<void> {
        const subcommand = interaction.options.getSubcommand();
        const target = interaction.options.getUser('target', true);

        if (target.bot) {
            await interaction.reply({ content: '🤖 You cannot gift assets to bots.' });
            return;
        }

        await interaction.deferReply();

        try {
        await ensureAccount(interaction.user.id);
        const recipientAccount = await ensureAccount(target.id);

        if (subcommand === 'stock') {
            await this.giftStock(interaction, target, recipientAccount);
        } else {
            await this.giftOption(interaction, target, recipientAccount);
        }
        } catch (error: any) {
            const message = error?.message ?? String(error);
            await interaction.editReply({ content: `❌ Gift failed: ${message}` });
        }
    }

    private async giftStock(
        interaction: ChatInputCommandInteraction,
        target: User,
        recipientAccount: Awaited<ReturnType<typeof ensureAccount>>,
    ): Promise<void> {
        const symbol = interaction.options.getString('symbol', true).toUpperCase();
        const quantity = interaction.options.getInteger('quantity', true);

        const quote = await getQuote(symbol);
        const price = quote.price;
        if (!Number.isFinite(price) || price <= 0) {
            throw new Error('Unable to determine market price for that ticker.');
        }

        const costBasis = price * quantity;
        const key = positionKey('EQUITY', symbol);
        const existing = recipientAccount.positions[key] as EquityPosition | undefined;
        if (existing) {
            const totalQuantity = existing.quantity + quantity;
            const totalCost = (existing.avgCost * existing.quantity) + (price * quantity);
            existing.quantity = totalQuantity;
            existing.avgCost = totalCost / totalQuantity;
            upsertPosition(recipientAccount, existing);
        } else {
            const position: EquityPosition = {
                assetType: 'EQUITY',
                symbol,
                quantity,
                avgCost: price,
            };
            upsertPosition(recipientAccount, position);
        }
        recipientAccount.buyingPower = recipientAccount.cash;
        await saveAccount(recipientAccount);

        const embed = new EmbedBuilder()
            .setTitle('🎁 Stock Gift Complete')
            .setColor(0x9b59b6)
            .setDescription(`${interaction.user.username} gifted ${quantity} share(s) of ${symbol} to ${target.username}.`)
            .addFields(
                { name: 'Approximate Value', value: formatCurrency(costBasis), inline: true },
                { name: 'Quote Price', value: formatCurrency(price), inline: true },
            )
            .setFooter({ text: 'Paper trading gift processed successfully.' });

        await interaction.editReply({ embeds: [embed] });
    }

    private async giftOption(
        interaction: ChatInputCommandInteraction,
        target: User,
        recipientAccount: Awaited<ReturnType<typeof ensureAccount>>,
    ): Promise<void> {
        const symbol = interaction.options.getString('symbol', true).toUpperCase();
        const expiration = interaction.options.getString('expiration', true);
        const strike = interaction.options.getNumber('strike', true);
        const optionType = interaction.options.getString('type', true);
        const quantity = interaction.options.getInteger('quantity', true);

        if (!expiration.match(/\d{4}-\d{2}-\d{2}/)) {
            throw new Error('Expiration must be in YYYY-MM-DD format.');
        }

        const quote = await getQuote(symbol);
        const price = quote.price;
        if (!Number.isFinite(price) || price <= 0) {
            throw new Error('Unable to determine underlying price for that ticker.');
        }

        const avgCost = Math.max(0.01, price * 0.1);
        const position: OptionPosition = {
            assetType: 'OPTION',
            symbol,
            quantity,
            avgCost,
            contractSymbol: `${symbol}${expiration.replace(/-/g, '')}${optionType === 'CALL' ? 'C' : 'P'}${Math.round(strike * 1000).toString().padStart(8, '0')}`,
            expiration,
            strike,
            right: optionType === 'CALL' ? 'CALL' : 'PUT',
            multiplier: recipientAccount.settings.optionMultiplier,
        };

        const key = positionKey('OPTION', symbol, position.contractSymbol);
        const existing = recipientAccount.positions[key] as OptionPosition | undefined;
        if (existing) {
            const totalQty = existing.quantity + quantity;
            const totalCost = (existing.avgCost * existing.quantity) + (avgCost * quantity);
            existing.quantity = totalQty;
            existing.avgCost = totalCost / totalQty;
            upsertPosition(recipientAccount, existing);
        } else {
            upsertPosition(recipientAccount, position);
        }
        await saveAccount(recipientAccount);

        const embed = new EmbedBuilder()
            .setTitle('🎁 Option Gift Complete')
            .setColor(0xe67e22)
            .setDescription(`${interaction.user.username} gifted ${quantity} ${symbol} ${optionType} contract(s) expiring ${expiration} to ${target.username}.`)
            .addFields(
                { name: 'Strike', value: formatNumber(strike, 2), inline: true },
                { name: 'Underlying Price', value: formatCurrency(price), inline: true },
            )
            .setFooter({ text: 'Paper trading gift processed successfully.' });

        await interaction.editReply({ embeds: [embed] });
    }
}
