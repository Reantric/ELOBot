const currencyCache = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: string): Intl.NumberFormat {
    if (!currencyCache.has(currency)) {
        currencyCache.set(currency, new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            maximumFractionDigits: 2,
        }));
    }
    return currencyCache.get(currency)!;
}

export function formatCurrency(value: number, currency = 'USD'): string {
    if (!Number.isFinite(value)) return '—';
    const formatter = getCurrencyFormatter(currency);
    return formatter.format(value);
}

export function formatNumber(value: number, fractionDigits = 2): string {
    if (!Number.isFinite(value)) return '—';
    return value.toLocaleString('en-US', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    });
}

export function formatPercentage(value: number, fractionDigits = 2): string {
    if (!Number.isFinite(value)) return '—';
    return `${formatNumber(value * 100, fractionDigits)}%`;
}

export function formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString('en-US', {
        timeZone: 'UTC',
        hour12: false,
    });
}

export function buildTradeEmbed(
    interaction: ChatInputCommandInteraction,
    execution: TradeExecution,
    side: 'BUY' | 'SELL'
): EmbedBuilder {
    const { trade, valuation } = execution;
    const action = side === 'BUY' ? 'Bought' : 'Sold';
    const embed = new EmbedBuilder()
        .setTitle(`${action} ${trade.symbol}`)
        .setColor(side === 'BUY' ? 0x2ecc71 : 0xe74c3c)
        .setTimestamp(new Date())
        .setFooter({ text: `Requested by ${interaction.user.username}` });

    const assetLabel = trade.assetType === 'OPTION' ? 'Option' : 'Stock';
    embed.addFields(
        { name: 'Asset', value: assetLabel, inline: true },
        { name: 'Filled', value: `${trade.filledQuantity}`, inline: true },
        { name: 'Price', value: formatCurrency(trade.executedPrice), inline: true },
    );

    if (trade.assetType === 'OPTION' && trade.position && trade.position.assetType === 'OPTION') {
        embed.addFields({
            name: 'Contract',
            value: `${trade.position.symbol} ${trade.position.expiration} ${trade.position.right} ${trade.position.strike}`,
            inline: false,
        });
    }

    embed.addFields(
        { name: 'Cash', value: formatCurrency(valuation.cash), inline: true },
        { name: 'Net Worth', value: formatCurrency(valuation.netWorth), inline: true },
        { name: 'TWR', value: formatPercentage(valuation.twr), inline: true },
    );

    embed.addFields(
        { name: 'Unrealized P/L', value: formatCurrency(valuation.unrealizedPnl), inline: true },
        { name: 'Realized P/L', value: formatCurrency(valuation.realizedPnl), inline: true },
    );

    return embed;
}
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { TradeExecution } from './trades.js';
