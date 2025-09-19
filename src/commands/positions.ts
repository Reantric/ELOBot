import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, Client, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Interaction } from 'discord.js';
import { IBotInteraction } from '../api/capi';
import { markToMarket } from '../util/trading/portfolio.js';
import { formatCurrency, formatNumber, formatPercentage } from '../util/trading/view.js';

export default class Positions implements IBotInteraction {
    name(): string {
        return 'positions';
    }

    help(): string {
        return 'List your open positions and valuations';
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
        await interaction.deferReply({ ephemeral: true });

        try {
            const valuation = await markToMarket(interaction.user.id, true);
            const embed = new EmbedBuilder()
                .setTitle(`${interaction.user.username}'s Positions`)
                .setColor(0x1abc9c)
                .addFields(
                    { name: 'Cash', value: formatCurrency(valuation.cash), inline: true },
                    { name: 'Net Worth', value: formatCurrency(valuation.netWorth), inline: true },
                    { name: 'TWR', value: formatPercentage(valuation.twr), inline: true },
                )
                .addFields(
                    { name: 'Realized P/L', value: formatCurrency(valuation.realizedPnl), inline: true },
                    { name: 'Unrealized P/L', value: formatCurrency(valuation.unrealizedPnl), inline: true },
                    { name: 'Positions Value', value: formatCurrency(valuation.positionsValue), inline: true },
                );

            if (valuation.snapshots.length === 0) {
                embed.addFields({ name: 'Positions', value: 'No open positions' });
            } else {
                const lines = valuation.snapshots.map(snapshot => {
                    if (snapshot.position.assetType === 'EQUITY') {
                        const pnlPct = snapshot.costBasis !== 0 ? (snapshot.unrealizedPnl / snapshot.costBasis) : 0;
                        return `**${snapshot.position.symbol}** • ${snapshot.position.quantity} shares @ ${formatCurrency(snapshot.marketPrice)} • MV ${formatCurrency(snapshot.marketValue)} • P/L ${formatCurrency(snapshot.unrealizedPnl)} (${formatPercentage(pnlPct)})`;
                    }
                    const option = snapshot.position;
                    const pnlPct = snapshot.costBasis !== 0 ? (snapshot.unrealizedPnl / snapshot.costBasis) : 0;
                    return `**${option.symbol} ${option.expiration} ${option.right} ${formatNumber(option.strike, 2)}** • ${option.quantity}x${option.multiplier} @ ${formatCurrency(snapshot.marketPrice)} • MV ${formatCurrency(snapshot.marketValue)} • P/L ${formatCurrency(snapshot.unrealizedPnl)} (${formatPercentage(pnlPct)})`;
                });
                embed.addFields({ name: 'Positions', value: lines.slice(0, 15).join('\n') });
                if (lines.length > 15) {
                    embed.addFields({ name: 'More', value: `+${lines.length - 15} additional positions` });
                }
            }

            const pending = valuation.account.pendingOrders ?? [];
            const components = pending.length > 0
                ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`positions_pending_${interaction.id}`)
                        .setLabel('View Pending Orders')
                        .setStyle(ButtonStyle.Secondary)
                )]
                : [];

            await interaction.editReply({ embeds: [embed], components });

            if (pending.length > 0) {
                const filter = (i: Interaction) => i.isButton() && i.customId === `positions_pending_${interaction.id}` && i.user.id === interaction.user.id;
                const collector = interaction.channel?.createMessageComponentCollector({ filter, time: 60_000, max: 1 });
                collector?.on('collect', async button => {
                    const list = pending.map(order => {
                        const ts = new Date(order.createdAt).toLocaleString('en-US', { hour12: false });
                        return `${order.side} ${order.symbol} ${order.expiration} ${order.right} ${order.strike} • Qty ${order.quantity} @ ${formatCurrency(order.limitPrice)} • Placed ${ts}`;
                    }).join('\n');
                    await button.reply({ ephemeral: true, content: list || 'No pending orders.' });
                });
                collector?.on('end', () => {
                    interaction.editReply({ components: [] }).catch(() => undefined);
                });
            }
        } catch (error: any) {
            await interaction.editReply({ content: `❌ Failed to load positions: ${error.message ?? error}` });
        }
    }
}
