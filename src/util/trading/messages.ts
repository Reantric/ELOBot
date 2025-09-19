import { formatCurrency, formatNumber } from './view.js';
import type { PendingOrder, TradeSide } from './types.js';

export function describePendingOrder(order: PendingOrder, side: TradeSide): string {
    const comparator = side === 'BUY' ? '≤' : '≥';
    if (order.assetType === 'OPTION') {
        return `🕒 Placed ${side} limit order for ${order.symbol} ${order.expiration} ${order.right} ${formatNumber(order.strike, 2)} @ ${comparator} ${formatCurrency(order.limitPrice)} (qty ${order.quantity}).`;
    }
    return `🕒 Placed ${side} limit order for ${order.symbol} @ ${comparator} ${formatCurrency(order.limitPrice)} (qty ${order.quantity}).`;
}
