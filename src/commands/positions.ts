import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, Client, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Interaction } from 'discord.js';
import { IBotInteraction } from '../api/capi';
import { markToMarket } from '../util/trading/portfolio.js';
import type { PendingOrder } from '../util/trading/types.js';
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

            const makeRow = (viewDisabled: boolean, returnDisabled: boolean) => new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`positions_pending_${interaction.id}`)
                    .setLabel('View Pending Orders')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(viewDisabled),
                new ButtonBuilder()
                    .setCustomId(`positions_return_${interaction.id}`)
                    .setLabel('Return to Positions')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(returnDisabled),
            );

            let currentComponents = [makeRow(false, true)];
            await interaction.editReply({ embeds: [embed], components: currentComponents });

            const filter = (i: Interaction) => i.isButton()
                && (i.customId === `positions_pending_${interaction.id}` || i.customId === `positions_return_${interaction.id}`)
                && i.user.id === interaction.user.id;
            const collector = interaction.channel?.createMessageComponentCollector({ filter, time: 120_000 });

            collector?.on('collect', async button => {
                await button.deferUpdate();
                if (button.customId === `positions_pending_${interaction.id}`) {
                    currentComponents = [makeRow(true, false)];
                    const pendingEmbed = this.buildPendingEmbed(interaction, pending);
                    await interaction.editReply({ embeds: [pendingEmbed], components: currentComponents });
                    return;
                }

                currentComponents = [makeRow(false, true)];
                await interaction.editReply({ embeds: [embed], components: currentComponents });
            });

            collector?.on('end', async () => {
                await interaction.editReply({ components: currentComponents }).catch(() => undefined);
            });
        } catch (error: any) {
            await interaction.editReply({ content: `❌ Failed to load positions: ${error.message ?? error}` });
        }
    }

    private buildPendingEmbed(interaction: ChatInputCommandInteraction, pending: PendingOrder[]): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setTitle(`${interaction.user.username}'s Pending Orders`)
            .setColor(0xf1c40f);

        if (pending.length === 0) {
            embed.setDescription('No pending orders.');
            return embed;
        }

        const lines = pending.map(order => {
            const placed = new Date(order.createdAt).toLocaleString('en-US', { hour12: false });
            if (order.assetType === 'OPTION') {
                return `${order.side} ${order.symbol} ${order.expiration} ${order.right} ${formatNumber(order.strike, 2)} • Qty ${order.quantity} @ ${formatCurrency(order.limitPrice)} • Placed ${placed}`;
            }
            return `${order.side} ${order.symbol} • Qty ${order.quantity} @ ${formatCurrency(order.limitPrice)} • Placed ${placed}`;
        });

        embed.setDescription(lines.join('\n').slice(0, 4096));
        return embed;
    }
}
