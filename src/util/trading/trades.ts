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

const FEES_PER_TRADE = 0;

export async function executeBuy(request: TradeRequest): Promise<TradeExecution> {
    const account = await ensureAccount(request.userId);
    const accountAfter = await handleTrade(account, request, 'BUY');
    const valuation = await markToMarket(request.userId, true);
    return { trade: accountAfter, valuation };
}

export async function executeSell(request: TradeRequest): Promise<TradeExecution> {
    const account = await ensureAccount(request.userId);
    const accountAfter = await handleTrade(account, request, 'SELL');
    const valuation = await markToMarket(request.userId, true);
    return { trade: accountAfter, valuation };
}

async function handleTrade(account: TradingAccount, request: TradeRequest, side: TradeSide): Promise<TradeResult> {
    if (request.quantity <= 0 || !Number.isFinite(request.quantity)) {
        throw new Error('Quantity must be positive');
    }

    if (request.assetType === 'EQUITY') {
        return handleEquityTrade(account, request, side);
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

async function handleOptionTrade(account: TradingAccount, request: OptionTradeRequest, side: TradeSide): Promise<TradeResult> {
    const symbol = request.symbol.toUpperCase();
    const chain = await getOptionChain(symbol, request.expiration);
    const bucket = request.right === 'CALL' ? chain.calls : chain.puts;
    const contract = bucket.find(item => Math.abs(item.strike - request.strike) < 1e-6);
    if (!contract) {
        throw new Error('Option contract not found; try /chain to inspect available strikes');
    }

    const multiplier = request.multiplier ?? account.settings.optionMultiplier;
    const price = request.price ?? contract.midpoint ?? contract.lastPrice ?? contract.bid ?? contract.ask;
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
        account,
        position: account.positions[key],
        executedPrice: price,
        cost: notional,
        filledQuantity: quantity,
        symbol,
        assetType: 'OPTION',
    };
}
