import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, Client } from 'discord.js';
import { IBotInteraction } from '../api/capi';
import { executeBuy } from '../util/trading/trades.js';
import { buildTradeRequest } from '../util/trading/commandHelpers.js';
import { buildTradeEmbed } from '../util/trading/view.js';

export default class Buy implements IBotInteraction {
    name(): string {
        return 'buy';
    }

    help(): string {
        return 'Execute a market buy for stocks or options';
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
            .addStringOption(option => option
                .setName('symbol')
                .setDescription('Ticker symbol (e.g., AAPL)')
                .setRequired(true))
            .addStringOption(option => option
                .setName('asset')
                .setDescription('Asset type to trade')
                .addChoices(
                    { name: 'Stock', value: 'EQUITY' },
                    { name: 'Option', value: 'OPTION' },
                )
                .setRequired(true))
            .addIntegerOption(option => option
                .setName('quantity')
                .setDescription('Shares or option contracts (whole numbers)')
                .setMinValue(1)
                .setRequired(true))
            .addNumberOption(option => option
                .setName('price')
                .setDescription('Optional limit price per share/contract'))
            .addStringOption(option => option
                .setName('expiration')
                .setDescription('Option expiration YYYY-MM-DD (required for options)'))
            .addNumberOption(option => option
                .setName('strike')
                .setDescription('Option strike price (required for options)'))
            .addStringOption(option => option
                .setName('right')
                .setDescription('Option type')
                .addChoices(
                    { name: 'Call', value: 'CALL' },
                    { name: 'Put', value: 'PUT' },
                ));
    }

    async runCommand(interaction: ChatInputCommandInteraction, _Bot: Client): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        try {
            const execution = await this.execute(interaction);
            if (!execution) return;
            const embed = buildTradeEmbed(interaction, execution, 'BUY');
            await interaction.editReply({ embeds: [embed] });
        } catch (error: any) {
            await interaction.editReply({ content: `❌ Failed to execute trade: ${error.message ?? error}` });
        }
    }

    private async execute(interaction: ChatInputCommandInteraction) {
        const { request, error } = buildTradeRequest(interaction, interaction.user.id);
        if (!request) {
            await interaction.editReply({ content: `❗ ${error}` });
            return null;
        }

        return executeBuy(request);
    }
}
