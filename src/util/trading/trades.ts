import { randomUUID } from 'crypto';
import { ensureAccount, saveAccount, positionKey, upsertPosition, removePosition, appendTrade, createTrade } from './dataStore.js';
import { getOptionChain, getQuote } from './marketData.js';
import { markToMarket, PortfolioValuation } from './portfolio.js';
import {
    AssetType,
    OptionRight,
    OptionPosition,
    Position,
    TradeSide,
    TradingAccount,
    PendingOptionOrder,
} from './types.js';

export interface TradeRequestBase {
    userId: string;
    symbol: string;
    quantity: number;
    price?: number;
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
    limitOrder?: boolean;
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
    | { kind: 'pending'; order: PendingOptionOrder };

export type TradeResultOrOrder =
    | { kind: 'filled'; execution: TradeExecution }
    | { kind: 'pending'; order: PendingOptionOrder };

const FEES_PER_TRADE = 0;

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
        return { kind: 'filled', result: await handleEquityTrade(account, request, side) };
    }
    return handleOptionTrade(account, request as OptionTradeRequest, side);
}

async function handleEquityTrade(account: TradingAccount, request: EquityTradeRequest, side: TradeSide): Promise<TradeResult> {
    const symbol = request.symbol.toUpperCase();
    const quotePrice = request.price ?? (await getQuote(symbol)).price;
    const quantity = Math.floor(request.quantity);
    const cost = quotePrice * quantity;

    if (side === 'BUY') {
        if (account.cash < cost + FEES_PER_TRADE) {
            throw new Error('Insufficient cash to execute trade');
        }
        account.cash -= cost + FEES_PER_TRADE;
        account.buyingPower = account.cash;

        const key = positionKey('EQUITY', symbol);
        const existing = account.positions[key] as Position | undefined;
        if (existing) {
            const newQuantity = existing.quantity + quantity;
            const newAvg = ((existing.avgCost * existing.quantity) + (quotePrice * quantity)) / newQuantity;
            existing.quantity = newQuantity;
            existing.avgCost = newAvg;
            upsertPosition(account, existing);
        } else {
            const position: Position = {
                assetType: 'EQUITY',
                symbol,
                quantity,
                avgCost: quotePrice,
            };
            upsertPosition(account, position);
        }
    } else {
        const key = positionKey('EQUITY', symbol);
        const existing = account.positions[key] as Position | undefined;
        if (!existing || existing.quantity < quantity) {
            throw new Error('Cannot sell more shares than you hold');
        }
        const proceeds = quotePrice * quantity;
        account.cash += proceeds - FEES_PER_TRADE;
        account.buyingPower = account.cash;
        const realized = (quotePrice - existing.avgCost) * quantity;
        account.realizedPnl += realized;

        const remaining = existing.quantity - quantity;
        if (remaining === 0) {
            removePosition(account, 'EQUITY', symbol);
        } else {
            existing.quantity = remaining;
            upsertPosition(account, existing);
        }
    }

    const trade = createTrade(side, {
        assetType: 'EQUITY',
        symbol,
        quantity,
        price: quotePrice,
        notional: cost,
        fees: FEES_PER_TRADE,
    });
    appendTrade(account, trade);
    await saveAccount(account);
    return {
        account,
        position: account.positions[positionKey('EQUITY', symbol)],
        executedPrice: quotePrice,
        cost,
        filledQuantity: quantity,
        symbol,
        assetType: 'EQUITY',
    };
}

export async function processPendingOrders(account: TradingAccount): Promise<{ account: TradingAccount; filled: PendingOptionOrder[] }> {
    const pending = account.pendingOrders ?? [];
    if (!pending.length) {
        return { account, filled: [] };
    }

    const remaining: PendingOptionOrder[] = [];
    const filled: PendingOptionOrder[] = [];

    for (const order of pending) {
        const chain = await getOptionChain(order.symbol, order.expiration);
        const bucket = order.right === 'CALL' ? chain.calls : chain.puts;
        const contract = bucket.find(item => Math.abs(item.strike - order.strike) < 1e-6);
        if (!contract) {
            remaining.push(order);
            continue;
        }

        const bid = contract.bid ?? contract.midpoint ?? contract.lastPrice;
        const ask = contract.ask ?? contract.midpoint ?? contract.lastPrice;
        const fillPrice = order.side === 'BUY' ? ask : bid;
        const fillable = order.side === 'BUY'
            ? (fillPrice != null && Number.isFinite(fillPrice) && fillPrice <= order.limitPrice)
            : (fillPrice != null && Number.isFinite(fillPrice) && fillPrice >= order.limitPrice);

        if (!fillable || fillPrice == null) {
            remaining.push(order);
            continue;
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
        if (outcome.kind === 'filled') {
            order.status = 'FILLED';
            order.filledAt = Date.now();
            order.fillPrice = fillPrice;
            filled.push(order);
            account = outcome.result.account;
        } else {
            remaining.push(order);
        }
    }

    account.pendingOrders = remaining;
    if (filled.length) {
        await saveAccount(account);
    }

    return { account, filled };
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
