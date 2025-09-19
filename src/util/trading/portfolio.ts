import { ensureAccount, saveAccount, TEST_ACCOUNT_ID, removePosition } from './dataStore.js';
import { processPendingOrders } from './trades.js';
import { getOptionChain, getQuote, getRiskFreeRate } from './marketData.js';
import { bsGreeks, bsPrice, impliedVol } from './pricing.js';
import { startOfDayUtc, toDate, timeToExpiry } from './time.js';
import {
    EquityPosition,
    Greeks,
    OptionContractQuote,
    OptionPosition,
    Position,
    TradingAccount,
} from './types.js';

export interface PositionSnapshot {
    position: Position;
    marketPrice: number;
    marketValue: number;
    costBasis: number;
    unrealizedPnl: number;
    quote?: OptionContractQuote;
    greeks?: Greeks;
}

export interface PortfolioValuation {
    account: TradingAccount;
    cash: number;
    positionsValue: number;
    unrealizedPnl: number;
    netWorth: number;
    realizedPnl: number;
    twr: number;
    snapshots: PositionSnapshot[];
}

export interface MarkOptions {
    userId: string;
    force?: boolean;
}

export async function markToMarket(userId: string, force = false): Promise<PortfolioValuation> {
    let account = await ensureAccount(userId);
    const pendingResult = await processPendingOrders(account);
    account = pendingResult.account;

    const quoteCache = new Map<string, number>();
    await settleExpiredOptions(account, quoteCache);

    if (userId === TEST_ACCOUNT_ID && account.mockSeeded && account.netWorthHistory.length > 0) {
        const latest = account.netWorthHistory[account.netWorthHistory.length - 1];
        const positionsValue = latest.positionsValue ?? 0;

        const snapshots: PositionSnapshot[] = [];

        const valuation: PortfolioValuation = {
            account,
            cash: latest.cash,
            positionsValue,
            unrealizedPnl: 0,
            netWorth: latest.netWorth,
            realizedPnl: account.realizedPnl ?? 0,
            twr: account.twr,
            snapshots,
        };

        await saveAccount(account);
        return valuation;
    }

    const snapshots: PositionSnapshot[] = [];
    let positionsValue = 0;
    let unrealized = 0;

    const riskFree = await getRiskFreeRate();

    for (const position of Object.values(account.positions)) {
        if (!position || position.quantity <= 0) {
            continue;
        }

        if (position.assetType === 'EQUITY') {
            const equitySnapshot = await priceEquityPosition(position, quoteCache);
            snapshots.push(equitySnapshot);
            positionsValue += equitySnapshot.marketValue;
            unrealized += equitySnapshot.unrealizedPnl;
            continue;
        }

        const optionSnapshot = await priceOptionPosition(position as OptionPosition, quoteCache, riskFree);
        snapshots.push(optionSnapshot);
        positionsValue += optionSnapshot.marketValue;
        unrealized += optionSnapshot.unrealizedPnl;
    }

    const netWorth = account.cash + positionsValue;
    account.lastMark = Date.now();

    await recordNetWorth(account, positionsValue, netWorth);
    await saveAccount(account);

    return buildValuation(account, snapshots, positionsValue, unrealized, netWorth);
}

async function priceEquityPosition(position: EquityPosition, quoteCache: Map<string, number>): Promise<PositionSnapshot> {
    const symbol = position.symbol.toUpperCase();
    let price: number;
    if (quoteCache.has(symbol)) {
        price = quoteCache.get(symbol)!;
    } else {
        const quote = await getQuote(symbol);
        price = quote.price;
        quoteCache.set(symbol, price);
    }

    const marketValue = price * position.quantity;
    const costBasis = position.avgCost * position.quantity;
    return {
        position,
        marketPrice: price,
        marketValue,
        costBasis,
        unrealizedPnl: marketValue - costBasis,
    };
}

async function priceOptionPosition(position: OptionPosition, quoteCache: Map<string, number>, riskFreeRate: number): Promise<PositionSnapshot> {
    const underlying = position.symbol.toUpperCase();
    let underlyingPrice: number;
    if (quoteCache.has(underlying)) {
        underlyingPrice = quoteCache.get(underlying)!;
    } else {
        const quote = await getQuote(underlying);
        underlyingPrice = quote.price;
        quoteCache.set(underlying, underlyingPrice);
    }

    const chain = await getOptionChain(underlying, position.expiration);
    const contracts = position.right === 'CALL' ? chain.calls : chain.puts;
    const contract = contracts.find(item => item.contractSymbol === position.contractSymbol || Math.abs(item.strike - position.strike) < 1e-6);

    if (!contract) {
        throw new Error(`Option contract not found for ${position.contractSymbol ?? `${underlying} ${position.expiration} ${position.right} ${position.strike}`}`);
    }

    const T = timeToExpiry(position.expiration);
    const isCall = position.right === 'CALL';
    const mid = contract.midpoint ?? contract.lastPrice ?? contract.bid ?? contract.ask ?? 0;
    let implied = contract.impliedVolatility;
    if ((!implied || implied <= 0) && mid > 0) {
        implied = impliedVol(underlyingPrice, position.strike, riskFreeRate, T, isCall, mid);
    }
    if (!implied || !Number.isFinite(implied)) {
        implied = 0.3;
    }

    const modelPrice = bsPrice(underlyingPrice, position.strike, riskFreeRate, implied, T, isCall);
    const markPrice = mid > 0 ? mid : modelPrice;

    const multiplier = position.multiplier ?? 100;
    const marketValue = markPrice * multiplier * position.quantity;
    const costBasis = position.avgCost * multiplier * position.quantity;

    const greeks = bsGreeks(underlyingPrice, position.strike, riskFreeRate, implied, T, isCall);

    position.lastMark = markPrice;
    position.lastImpliedVol = implied;
    position.lastUnderlying = underlyingPrice;

    return {
        position,
        marketPrice: markPrice,
        marketValue,
        costBasis,
        unrealizedPnl: marketValue - costBasis,
        quote: contract,
        greeks,
    };
}

async function recordNetWorth(account: TradingAccount, positionsValue: number, netWorth: number): Promise<void> {
    const timestamp = Date.now();
    const history = account.netWorthHistory ?? [];
    const previous = history.length > 0 ? history[history.length - 1] : undefined;
    const baseNetWorth = history.length > 0 ? history[0].netWorth : netWorth;

    const baseReturn = baseNetWorth > 0 ? (netWorth / baseNetWorth) - 1 : 0;
    const dailyReturn = previous && previous.netWorth > 0
        ? (netWorth - previous.netWorth) / previous.netWorth
        : baseReturn;

    if (previous) {
        const priorTwr = Number.isFinite(account.twr) ? account.twr : (previous.cumulativeReturn ?? 0);
        account.twr = ((priorTwr + 1) * (dailyReturn + 1)) - 1;
        account.twrFactors = [...(account.twrFactors ?? []), 1 + dailyReturn].slice(-1000);
    } else {
        account.twr = baseReturn;
        account.twrFactors = [];
    }

    const snapshot = {
        timestamp,
        cash: account.cash,
        positionsValue,
        netWorth,
        realizedPnl: account.realizedPnl,
        dailyReturn,
        cumulativeReturn: account.twr,
        twr: account.twr,
    };

    history.push(snapshot);
    account.netWorthHistory = history.slice(-1000);
}

function buildValuation(
    account: TradingAccount,
    snapshots: PositionSnapshot[],
    positionsValue?: number,
    unrealized?: number,
    netWorth?: number
): PortfolioValuation {
    const totalPositionsValue = positionsValue ?? snapshots.reduce((sum, snap) => sum + snap.marketValue, 0);
    const totalUnrealized = unrealized ?? snapshots.reduce((sum, snap) => sum + snap.unrealizedPnl, 0);
    const computedNetWorth = netWorth ?? account.cash + totalPositionsValue;

    return {
        account,
        cash: account.cash,
        positionsValue: totalPositionsValue,
        unrealizedPnl: totalUnrealized,
        netWorth: computedNetWorth,
        realizedPnl: account.realizedPnl,
        twr: account.twr,
        snapshots,
    };
}

async function settleExpiredOptions(account: TradingAccount, quoteCache: Map<string, number>): Promise<void> {
    const today = startOfDayUtc(new Date());
    const optionEntries = Object.entries(account.positions);
    let mutated = false;

    for (const [key, position] of optionEntries) {
        if (!position || position.assetType !== 'OPTION') {
            continue;
        }
        const expiryDate = startOfDayUtc(toDate(position.expiration));
        if (expiryDate > today) {
            continue;
        }

        const underlying = position.symbol.toUpperCase();
        let underlyingPrice = quoteCache.get(underlying);
        if (underlyingPrice == null) {
            const quote = await getQuote(underlying);
            underlyingPrice = quote.price;
            quoteCache.set(underlying, underlyingPrice);
        }

        const intrinsic = position.right === 'CALL'
            ? Math.max(0, underlyingPrice - position.strike)
            : Math.max(0, position.strike - underlyingPrice);

        const multiplier = position.multiplier ?? account.settings.optionMultiplier ?? 100;
        const contracts = position.quantity;
        const payoff = intrinsic * multiplier * contracts;
        const costBasis = position.avgCost * multiplier * contracts;

        account.cash += payoff;
        account.buyingPower = account.cash;
        account.realizedPnl += payoff - costBasis;
        removePosition(account, 'OPTION', position.symbol, position.contractSymbol);
        mutated = true;
    }

    if (mutated) {
        // ensure no stale references remain
        account.positions = { ...account.positions };
    }
}
