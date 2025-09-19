import { SlashCommandBuilder } from '@discordjs/builders';
import {
    ActionRowBuilder,
    ChatInputCommandInteraction,
    Client,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
} from 'discord.js';

import { IBotInteraction } from '../api/capi';
import { ensureAccount } from '../util/trading/dataStore.js';
import { cancelPendingOrder } from '../util/trading/trades.js';
import type { PendingOrder } from '../util/trading/types.js';
import { formatCurrency, formatNumber } from '../util/trading/view.js';

const SELECT_TIMEOUT_MS = 60_000;

export default class Cancel implements IBotInteraction {
    name(): string {
        return 'cancel';
    }

    help(): string {
        return 'Cancel an open stock or option order';
    }

    cooldown(): number {
        return 3;
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
            .setDescription(this.help());
    }

    async runCommand(interaction: ChatInputCommandInteraction, _Bot: Client): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        const account = await ensureAccount(interaction.user.id);
        const openOrders = (account.pendingOrders ?? []).filter(order => order.status === 'OPEN');

        if (openOrders.length === 0) {
            await interaction.editReply({ content: 'ℹ️ You have no open orders to cancel.' });
            return;
        }

        const selectId = `cancel:${interaction.id}`;
        const select = new StringSelectMenuBuilder()
            .setCustomId(selectId)
            .setPlaceholder('Select an order to cancel')
            .addOptions(openOrders.slice(0, 25).map(order => ({
                label: this.buildLabel(order).slice(0, 100),
                description: this.buildDescription(order).slice(0, 100),
                value: order.id,
            })));

        const components = [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)];
        const reply = await interaction.editReply({ content: 'Choose the order you want to cancel:', components });

        const selection = await reply.awaitMessageComponent({
            time: SELECT_TIMEOUT_MS,
            filter: (component): component is StringSelectMenuInteraction =>
                component.user.id === interaction.user.id && component.customId === selectId,
        }).catch(() => null);

        if (!selection || !selection.isStringSelectMenu()) {
            await interaction.editReply({ content: '⌛ Cancel request timed out.', components: [] });
            return;
        }

        await selection.deferUpdate();
        const orderId = selection.values[0];

        try {
            const result = await cancelPendingOrder(interaction.user.id, orderId);
            if (!result.cancelled) {
                await interaction.editReply({ content: '⚠️ That order was already filled or cancelled.', components: [] });
                return;
            }

            const summary = this.describeOrder(result.cancelled);
            await interaction.editReply({ content: `✅ Cancelled ${summary}`, components: [] });
        } catch (error: any) {
            await interaction.editReply({ content: `❌ Failed to cancel order: ${error?.message ?? String(error)}`, components: [] });
        }
    }

    private describeOrder(order: PendingOrder): string {
        if (order.assetType === 'OPTION') {
            return `${order.side} option order ${order.symbol} ${order.expiration} ${order.right} ${formatNumber(order.strike, 2)} @ ${formatCurrency(order.limitPrice)} (qty ${order.quantity}).`;
        }
        return `${order.side} stock order ${order.symbol} @ ${formatCurrency(order.limitPrice)} (qty ${order.quantity}).`;
    }

    private buildLabel(order: PendingOrder): string {
        if (order.assetType === 'OPTION') {
            return `${order.side} ${order.symbol} ${order.right} ${formatNumber(order.strike, 2)}`;
        }
        return `${order.side} ${order.symbol}`;
    }

    private buildDescription(order: PendingOrder): string {
        if (order.assetType === 'OPTION') {
            return `Exp ${order.expiration} • Qty ${order.quantity} @ ${formatCurrency(order.limitPrice)}`;
        }
        return `Qty ${order.quantity} @ ${formatCurrency(order.limitPrice)}`;
    }
}
