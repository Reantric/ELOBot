import { randomUUID } from 'crypto';
import { ensureAccount, saveAccount, positionKey, upsertPosition, removePosition, appendTrade, createTrade, ensureLiveTradingState, listAccounts } from './dataStore.js';
import { getOptionChain, getQuote } from './marketData.js';
import { markToMarket, PortfolioValuation } from './portfolio.js';
import {
    AssetType,
    OptionRight,
    OptionPosition,
    PendingEquityOrder,
    PendingOptionOrder,
    PendingOrder,
    Position,
    TradeSide,
    TradingAccount,
} from './types.js';

export interface TradeRequestBase {
    userId: string;
    symbol: string;
    quantity: number;
    price?: number;
    limitOrder?: boolean;
}

export interface EquityTradeRequest extends TradeRequestBase {
    assetType: 'EQUITY';
}

export interface OptionTradeRequest extends TradeRequestBase {
    assetType: 'OPTION';
    expiration: string;
    strike: number;
    right: OptionRight;
    multiplier?: number;
}

export type TradeRequest = EquityTradeRequest | OptionTradeRequest;

export interface TradeResult {
    account: TradingAccount;
    position?: Position;
    executedPrice: number;
    cost: number;
    filledQuantity: number;
    symbol: string;
    assetType: AssetType;
}

export interface TradeExecution {
    trade: TradeResult;
    valuation: PortfolioValuation;
}

export type TradeOutcome =
    | { kind: 'filled'; result: TradeResult }
    | { kind: 'pending'; order: PendingOrder };

export type TradeResultOrOrder =
    | { kind: 'filled'; execution: TradeExecution }
    | { kind: 'pending'; order: PendingOrder };

const FEES_PER_TRADE = 0;

let pendingOrderTimer: NodeJS.Timeout | null = null;

export async function executeBuy(request: TradeRequest): Promise<TradeResultOrOrder> {
    const account = await ensureAccount(request.userId);
    const outcome = await handleTrade(account, request, 'BUY');
    if (outcome.kind === 'pending') {
        return outcome;
    }
    const valuation = await markToMarket(request.userId, true);
    return { kind: 'filled', execution: { trade: outcome.result, valuation } };
}

export async function executeSell(request: TradeRequest): Promise<TradeResultOrOrder> {
    const account = await ensureAccount(request.userId);
    const outcome = await handleTrade(account, request, 'SELL');
    if (outcome.kind === 'pending') {
        return outcome;
    }
    const valuation = await markToMarket(request.userId, true);
    return { kind: 'filled', execution: { trade: outcome.result, valuation } };
}

async function handleTrade(account: TradingAccount, request: TradeRequest, side: TradeSide): Promise<TradeOutcome> {
    if (request.quantity <= 0 || !Number.isFinite(request.quantity)) {
        throw new Error('Quantity must be positive');
    }

    if (request.assetType === 'EQUITY') {
        return handleEquityTrade(account, request, side);
    }
    return handleOptionTrade(account, request as OptionTradeRequest, side);
}

async function handleEquityTrade(account: TradingAccount, request: EquityTradeRequest, side: TradeSide): Promise<TradeOutcome> {
    const symbol = request.symbol.toUpperCase();
    const quantity = Math.floor(request.quantity);
    if (quantity <= 0) {
        throw new Error('Quantity must be positive');
    }

    const convertedFromMock = ensureLiveTradingState(account);
    if (convertedFromMock) {
        await saveAccount(account);
    }

    const limitOrder = request.limitOrder === true && request.price != null;
    const { price: marketPrice } = await getQuote(symbol);

    let executionPrice = request.price ?? marketPrice;

    if (limitOrder) {
        const limit = request.price!;
        const fillable = side === 'BUY'
            ? marketPrice <= limit
            : marketPrice >= limit;

        if (!fillable) {
            const pendingOrder: PendingEquityOrder = {
                id: randomUUID(),
                assetType: 'EQUITY',
                userId: account.userId,
                symbol,
                side,
                limitPrice: limit,
                quantity,
                createdAt: Date.now(),
                status: 'OPEN',
            };
            account.pendingOrders = account.pendingOrders ?? [];
            account.pendingOrders.push(pendingOrder);
            await saveAccount(account);
            return { kind: 'pending', order: pendingOrder };
        }

        executionPrice = side === 'BUY'
            ? Math.min(marketPrice, limit)
            : Math.max(marketPrice, limit);
    }

    if (!Number.isFinite(executionPrice) || executionPrice <= 0) {
        throw new Error('Equity price unavailable');
    }

    const notional = executionPrice * quantity;

    const key = positionKey('EQUITY', symbol);
    const existing = account.positions[key] as Position | undefined;

    let realized = 0;
    let updatedPosition: Position | undefined = existing ? { ...existing } : undefined;

    if (side === 'BUY') {
        if (account.cash < notional + FEES_PER_TRADE) {
            throw new Error('Insufficient cash to execute trade');
        }
        account.cash -= notional + FEES_PER_TRADE;
        account.buyingPower = account.cash;

        if (!existing || existing.quantity === 0) {
            updatedPosition = {
                assetType: 'EQUITY',
                symbol,
                quantity,
                avgCost: executionPrice,
            };
        } else if (existing.quantity > 0) {
            const totalQuantity = existing.quantity + quantity;
            const totalCost = (existing.avgCost * existing.quantity) + (executionPrice * quantity);
            updatedPosition = {
                assetType: 'EQUITY',
                symbol,
                quantity: totalQuantity,
                avgCost: totalCost / totalQuantity,
            };
        } else {
            const shortSize = Math.abs(existing.quantity);
            const coverQty = Math.min(quantity, shortSize);
            if (coverQty > 0) {
                realized += (existing.avgCost - executionPrice) * coverQty;
            }
            const remainingShort = shortSize - coverQty;
            const leftover = quantity - coverQty;

            if (remainingShort > 0) {
                updatedPosition = {
                    assetType: 'EQUITY',
                    symbol,
                    quantity: -remainingShort,
                    avgCost: existing.avgCost,
                };
            } else if (leftover > 0) {
                updatedPosition = {
                    assetType: 'EQUITY',
                    symbol,
                    quantity: leftover,
                    avgCost: executionPrice,
                };
            } else {
                updatedPosition = undefined;
            }
        }
    } else {
        account.cash += notional - FEES_PER_TRADE;
        account.buyingPower = account.cash;

        if (!existing || existing.quantity === 0) {
            updatedPosition = {
                assetType: 'EQUITY',
                symbol,
                quantity: -quantity,
                avgCost: executionPrice,
            };
        } else if (existing.quantity > 0) {
            const sellFromLong = Math.min(quantity, existing.quantity);
            if (sellFromLong > 0) {
                realized += (executionPrice - existing.avgCost) * sellFromLong;
            }
            const remainingLong = existing.quantity - sellFromLong;
            const shortQty = quantity - sellFromLong;

            if (shortQty > 0) {
                updatedPosition = {
                    assetType: 'EQUITY',
                    symbol,
                    quantity: -shortQty,
                    avgCost: executionPrice,
                };
            } else if (remainingLong > 0) {
                updatedPosition = {
                    assetType: 'EQUITY',
                    symbol,
                    quantity: remainingLong,
                    avgCost: existing.avgCost,
                };
            } else {
                updatedPosition = undefined;
            }
        } else {
            const prevShort = Math.abs(existing.quantity);
            const totalShort = prevShort + quantity;
            updatedPosition = {
                assetType: 'EQUITY',
                symbol,
                quantity: -totalShort,
                avgCost: ((existing.avgCost * prevShort) + (executionPrice * quantity)) / totalShort,
            };
        }
    }

    account.realizedPnl += realized;

    if (!updatedPosition || updatedPosition.quantity === 0) {
        if (existing) {
            removePosition(account, 'EQUITY', symbol);
        }
    } else {
        upsertPosition(account, updatedPosition);
    }

    const trade = createTrade(side, {
        assetType: 'EQUITY',
        symbol,
        quantity,
        price: executionPrice,
        notional,
        fees: FEES_PER_TRADE,
    });
    appendTrade(account, trade);
    await saveAccount(account);

    return {
        kind: 'filled',
        result: {
            account,
            position: account.positions[positionKey('EQUITY', symbol)],
            executedPrice: executionPrice,
            cost: notional,
            filledQuantity: quantity,
            symbol,
            assetType: 'EQUITY',
        },
    };
}

export async function processPendingOrders(account: TradingAccount): Promise<{ account: TradingAccount; filled: PendingOrder[] }> {
    const pending = account.pendingOrders ?? [];
    if (!pending.length) {
        return { account, filled: [] };
    }

    const remaining: PendingOrder[] = [];
    const filled: PendingOrder[] = [];
    const quoteCache = new Map<string, number>();

    for (const order of pending) {
        if (order.assetType === 'OPTION') {
            const optionOutcome = await maybeFillOptionOrder(account, order);
            if (optionOutcome.kind === 'filled') {
                account = optionOutcome.account;
                filled.push(optionOutcome.order);
            } else if (optionOutcome.kind === 'open') {
                remaining.push(order);
            }
            continue;
        }

        const equityOutcome = await maybeFillEquityOrder(account, order, quoteCache);
        if (equityOutcome.kind === 'filled') {
            account = equityOutcome.account;
            filled.push(equityOutcome.order);
        } else if (equityOutcome.kind === 'open') {
            remaining.push(order);
        }
    }

    account.pendingOrders = remaining;
    if (filled.length) {
        await saveAccount(account);
    }

    return { account, filled };
}

type OptionOrderProcessResult =
    | { kind: 'filled'; order: PendingOptionOrder; account: TradingAccount }
    | { kind: 'open' };

async function maybeFillOptionOrder(account: TradingAccount, order: PendingOptionOrder): Promise<OptionOrderProcessResult> {
    const chain = await getOptionChain(order.symbol, order.expiration);
    const bucket = order.right === 'CALL' ? chain.calls : chain.puts;
    const contract = bucket.find(item => Math.abs(item.strike - order.strike) < 1e-6);
    if (!contract) {
        return { kind: 'open' };
    }

    const bid = contract.bid ?? contract.midpoint ?? contract.lastPrice;
    const ask = contract.ask ?? contract.midpoint ?? contract.lastPrice;
    const fillPrice = order.side === 'BUY' ? ask : bid;
    const fillable = order.side === 'BUY'
        ? (fillPrice != null && Number.isFinite(fillPrice) && fillPrice <= order.limitPrice)
        : (fillPrice != null && Number.isFinite(fillPrice) && fillPrice >= order.limitPrice);

    if (!fillable || fillPrice == null) {
        return { kind: 'open' };
    }

    const fillRequest: OptionTradeRequest = {
        userId: order.userId,
        assetType: 'OPTION',
        symbol: order.symbol,
        quantity: order.quantity,
        price: fillPrice,
        expiration: order.expiration,
        strike: order.strike,
        right: order.right,
        multiplier: order.multiplier,
        limitOrder: false,
    };

    const outcome = await handleOptionTrade(account, fillRequest, order.side);
    if (outcome.kind !== 'filled') {
        return { kind: 'open' };
    }

    const completed: PendingOptionOrder = {
        ...order,
        status: 'FILLED',
        filledAt: Date.now(),
        fillPrice,
    };
    return { kind: 'filled', order: completed, account: outcome.result.account };
}

type EquityOrderProcessResult =
    | { kind: 'filled'; order: PendingEquityOrder; account: TradingAccount }
    | { kind: 'open' };

async function maybeFillEquityOrder(
    account: TradingAccount,
    order: PendingEquityOrder,
    quoteCache: Map<string, number>,
): Promise<EquityOrderProcessResult> {
    const symbol = order.symbol.toUpperCase();
    let marketPrice = quoteCache.get(symbol);
    if (marketPrice == null) {
        marketPrice = (await getQuote(symbol)).price;
        quoteCache.set(symbol, marketPrice);
    }

    const fillable = order.side === 'BUY'
        ? marketPrice <= order.limitPrice
        : marketPrice >= order.limitPrice;

    if (!fillable) {
        return { kind: 'open' };
    }

    const executionPrice = order.side === 'BUY'
        ? Math.min(marketPrice, order.limitPrice)
        : Math.max(marketPrice, order.limitPrice);

    const fillRequest: EquityTradeRequest = {
        userId: order.userId,
        assetType: 'EQUITY',
        symbol,
        quantity: order.quantity,
        price: executionPrice,
        limitOrder: false,
    };

    const outcome = await handleEquityTrade(account, fillRequest, order.side);
    if (outcome.kind !== 'filled') {
        return { kind: 'open' };
    }

    const completed: PendingEquityOrder = {
        ...order,
        symbol,
        status: 'FILLED',
        filledAt: Date.now(),
        fillPrice: executionPrice,
    };

    return { kind: 'filled', order: completed, account: outcome.result.account };
}

async function handleOptionTrade(account: TradingAccount, request: OptionTradeRequest, side: TradeSide): Promise<TradeOutcome> {
    const symbol = request.symbol.toUpperCase();
    const chain = await getOptionChain(symbol, request.expiration);
    const bucket = request.right === 'CALL' ? chain.calls : chain.puts;
    const contract = bucket.find(item => Math.abs(item.strike - request.strike) < 1e-6);
    if (!contract) {
        throw new Error('Option contract not found; try /chain to inspect available strikes');
    }

    const multiplier = request.multiplier ?? account.settings.optionMultiplier;

    const convertedFromMock = ensureLiveTradingState(account);
    if (convertedFromMock) {
        await saveAccount(account);
    }
    const bid = contract.bid ?? contract.midpoint ?? contract.lastPrice;
    const ask = contract.ask ?? contract.midpoint ?? contract.lastPrice;
    const limitOrder = request.limitOrder === true && request.price != null;
    let price = request.price ?? (side === 'BUY' ? ask : bid);

    if (limitOrder) {
        const limit = request.price!;
        const fillPrice = side === 'BUY' ? ask : bid;
        const fillable = side === 'BUY'
            ? (fillPrice != null && Number.isFinite(fillPrice) && fillPrice <= limit)
            : (fillPrice != null && Number.isFinite(fillPrice) && fillPrice >= limit);

        if (!fillable) {
            const pendingOrder: PendingOptionOrder = {
                id: randomUUID(),
                assetType: 'OPTION',
                userId: account.userId,
                symbol,
                expiration: request.expiration,
                strike: request.strike,
                right: request.right,
                side,
                limitPrice: limit,
                quantity: Math.floor(request.quantity),
                multiplier,
                createdAt: Date.now(),
                status: 'OPEN',
            };
            account.pendingOrders = account.pendingOrders ?? [];
            account.pendingOrders.push(pendingOrder);
            await saveAccount(account);
            return { kind: 'pending', order: pendingOrder };
        }

        price = fillPrice;
    }

    if (!price || !Number.isFinite(price)) {
        throw new Error('Cannot determine option price');
    }

    const quantity = Math.floor(request.quantity);
    const notional = price * multiplier * quantity;

    const key = positionKey('OPTION', symbol, contract.contractSymbol);
    const existing = account.positions[key] as OptionPosition | undefined;

    if (side === 'BUY') {
        if (account.cash < notional + FEES_PER_TRADE) {
            throw new Error('Insufficient cash to execute option trade');
        }
        account.cash -= notional + FEES_PER_TRADE;
        account.buyingPower = account.cash;

        if (existing) {
            const newQuantity = existing.quantity + quantity;
            const newAvg = ((existing.avgCost * existing.quantity) + (price * quantity)) / newQuantity;
            existing.quantity = newQuantity;
            existing.avgCost = newAvg;
            existing.multiplier = multiplier;
            upsertPosition(account, existing);
        } else {
            const position: OptionPosition = {
                assetType: 'OPTION',
                symbol,
                quantity,
                avgCost: price,
                contractSymbol: contract.contractSymbol,
                expiration: request.expiration,
                strike: request.strike,
                right: request.right,
                multiplier,
            };
            upsertPosition(account, position);
        }
    } else {
        if (!existing || existing.quantity < quantity) {
            throw new Error('Cannot sell (close) more contracts than you hold');
        }
        const proceeds = price * multiplier * quantity;
        account.cash += proceeds - FEES_PER_TRADE;
        account.buyingPower = account.cash;
        const realized = (price - existing.avgCost) * multiplier * quantity;
        account.realizedPnl += realized;
        const remaining = existing.quantity - quantity;
        if (remaining === 0) {
            removePosition(account, 'OPTION', symbol, contract.contractSymbol);
        } else {
            existing.quantity = remaining;
            upsertPosition(account, existing);
        }
    }

    const trade = createTrade(side, {
        assetType: 'OPTION',
        symbol,
        contractSymbol: contract.contractSymbol,
        quantity,
        price,
        notional,
        fees: FEES_PER_TRADE,
    });
    appendTrade(account, trade);
    await saveAccount(account);

    return {
        kind: 'filled',
        result: {
            account,
            position: account.positions[key],
            executedPrice: price,
            cost: notional,
            filledQuantity: quantity,
            symbol,
            assetType: 'OPTION',
        },
    };
}

export async function cancelPendingOrder(userId: string, orderId: string): Promise<{ account: TradingAccount; cancelled?: PendingOrder }> {
    const account = await ensureAccount(userId);
    const pending = account.pendingOrders ?? [];
    const index = pending.findIndex(order => order.id === orderId && order.status === 'OPEN');
    if (index === -1) {
        return { account, cancelled: undefined };
    }

    const [cancelled] = pending.splice(index, 1);
    account.pendingOrders = pending;
    await saveAccount(account);
    return { account, cancelled };
}

export function startPendingOrderWatcher(intervalMs = 30_000): void {
    if (pendingOrderTimer) {
        return;
    }

    pendingOrderTimer = setInterval(async () => {
        try {
            const accounts = await listAccounts();
            for (const account of accounts) {
                if (!account.pendingOrders || account.pendingOrders.length === 0) {
                    continue;
                }
                const { account: updatedAccount, filled } = await processPendingOrders(account);
                if (filled.length > 0) {
                    try {
                        await markToMarket(updatedAccount.userId, true);
                    } catch (error) {
                        // ignore polling errors
                    }
                }
            }
        } catch (error) {
            // swallow polling errors to keep interval alive
        }
    }, intervalMs);
}
