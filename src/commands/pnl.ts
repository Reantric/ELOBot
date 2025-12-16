import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, Client, EmbedBuilder } from 'discord.js';
import { IBotInteraction } from '../api/capi';
import { markToMarket } from '../util/trading/portfolio.js';
import { formatCurrency, formatNumber, formatPercentage, formatTimestamp } from '../util/trading/view.js';

export default class PnL implements IBotInteraction {
    name(): string {
        return 'pnl';
    }

    help(): string {
        return 'Show account performance, P/L, and net worth history';
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
        return new SlashCommandBuilder().setName(this.name()).setDescription(this.help());
    }

    async runCommand(interaction: ChatInputCommandInteraction, _Bot: Client): Promise<void> {
        await interaction.deferReply();
        try {
            const valuation = await markToMarket(interaction.user.id, true);
            const { account } = valuation;
            const initial = account.settings.initialCash;
            const netWorth = valuation.netWorth;
            const totalReturn = initial > 0 ? (netWorth - initial) / initial : 0;

            const embed = new EmbedBuilder()
                .setTitle(`${interaction.user.username}'s Performance`)
                .setColor(0xe67e22)
                .addFields(
                    { name: 'Net Worth', value: formatCurrency(netWorth), inline: true },
                    { name: 'Cash', value: formatCurrency(valuation.cash), inline: true },
                    { name: 'Positions Value', value: formatCurrency(valuation.positionsValue), inline: true },
                )
                .addFields(
                    { name: 'Realized P/L', value: formatCurrency(valuation.realizedPnl), inline: true },
                    { name: 'Unrealized P/L', value: formatCurrency(valuation.unrealizedPnl), inline: true },
                    { name: 'Total Return', value: formatPercentage(totalReturn), inline: true },
                )
                .addFields(
                    { name: 'Time-Weighted Return', value: formatPercentage(valuation.twr), inline: true },
                    { name: 'Trades', value: `${account.tradeHistory.length}`, inline: true },
                    { name: 'Initial Capital', value: formatCurrency(initial), inline: true },
                );

            const history = account.netWorthHistory.slice(-5).reverse();
            if (history.length > 0) {
                const lines = history.map(point => {
                    const pnl = point.netWorth - initial;
                    const twr = point.twr ?? valuation.twr;
                    return `${formatTimestamp(point.timestamp)} • ${formatCurrency(point.netWorth)} • Δ ${formatCurrency(pnl)} • TWR ${formatPercentage(twr)}`;
                });
                embed.addFields({ name: 'Recent Net Worth', value: lines.join('\n') });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error: any) {
            await interaction.editReply({ content: `❌ Failed to compute P/L: ${error.message ?? error}` });
        }
    }
}
