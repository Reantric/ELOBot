import yahooFinance from 'yahoo-finance2';
import {
    OptionChain,
    OptionContractQuote,
    OptionRight,
    PriceQuote,
} from './types.js';

interface CacheEntry<T> {
    value: T;
    expires: number;
}

const quoteCache = new Map<string, CacheEntry<PriceQuote>>();
const chainCache = new Map<string, CacheEntry<OptionChain>>();
const riskFreeCache = new Map<string, CacheEntry<number>>();

const QUOTE_TTL_MS = 15_000;
const CHAIN_TTL_MS = 60_000;
const RISK_FREE_TTL_MS = 60 * 60 * 1000;

function now(): number {
    return Date.now();
}

function cacheGet<T>(store: Map<string, CacheEntry<T>>, key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expires < now()) {
        store.delete(key);
        return undefined;
    }
    return entry.value;
}

function cacheSet<T>(store: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): void {
    store.set(key, { value, expires: now() + ttlMs });
}

export async function getQuote(symbol: string): Promise<PriceQuote> {
    const upperSymbol = symbol.toUpperCase();
    const cached = cacheGet(quoteCache, upperSymbol);
    if (cached) return cached;

    const raw: any = await yahooFinance.quote(upperSymbol, {}, { validateResult: false });
    if (!raw) {
        throw new Error(`No quote data for ${upperSymbol}`);
    }

    const price = Number(raw.regularMarketPrice ?? raw.postMarketPrice ?? raw.preMarketPrice);
    if (Number.isNaN(price)) {
        throw new Error(`Quote price unavailable for ${upperSymbol}`);
    }

    const quote: PriceQuote = {
        symbol: upperSymbol,
        price,
        currency: raw.currency ?? 'USD',
        regularMarketTime: raw.regularMarketTime ? new Date(raw.regularMarketTime).getTime() : now(),
        previousClose: raw.regularMarketPreviousClose,
        change: raw.regularMarketChange,
        changePercent: raw.regularMarketChangePercent,
        dayHigh: raw.regularMarketDayHigh,
        dayLow: raw.regularMarketDayLow,
        dayOpen: raw.regularMarketOpen,
        fiftyTwoWeekHigh: raw.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: raw.fiftyTwoWeekLow,
        preMarketPrice: raw.preMarketPrice,
        preMarketChange: raw.preMarketChange,
        preMarketChangePercent: raw.preMarketChangePercent,
        postMarketPrice: raw.postMarketPrice,
        postMarketChange: raw.postMarketChange,
        postMarketChangePercent: raw.postMarketChangePercent,
        volume: raw.regularMarketVolume,
    };

    cacheSet(quoteCache, upperSymbol, quote, QUOTE_TTL_MS);
    return quote;
}

export async function getOptionChain(symbol: string, expiration?: string): Promise<OptionChain> {
    const upperSymbol = symbol.toUpperCase();
    const cacheKey = expiration ? `${upperSymbol}:${expiration}` : upperSymbol;
    const cached = cacheGet(chainCache, cacheKey);
    if (cached) return cached;

    const query: any = {};
    if (expiration) {
        query.date = expiration;
    }

    const raw: any = await yahooFinance.options(upperSymbol, query);
    if (!raw) {
        throw new Error(`No option chain for ${upperSymbol}`);
    }

    const calls: OptionContractQuote[] = (raw.options?.[0]?.calls ?? []).map((contract: any) => normalizeContract(contract, 'CALL'));
    const puts: OptionContractQuote[] = (raw.options?.[0]?.puts ?? []).map((contract: any) => normalizeContract(contract, 'PUT'));

    const chain: OptionChain = {
        underlyingSymbol: upperSymbol,
        expirationDates: raw.expirationDates?.map((d: any) => normalizeDate(d)) ?? [],
        calls,
        puts,
    };

    cacheSet(chainCache, cacheKey, chain, CHAIN_TTL_MS);
    return chain;
}

function normalizeDate(dateLike: any): string {
    if (typeof dateLike === 'string') return dateLike.slice(0, 10);
    if (typeof dateLike === 'number') return new Date(dateLike).toISOString().slice(0, 10);
    if (dateLike instanceof Date) return dateLike.toISOString().slice(0, 10);
    return new Date(dateLike ?? Date.now()).toISOString().slice(0, 10);
}

function normalizeContract(contract: any, right: OptionRight): OptionContractQuote {
    const bid = contract.bid ?? contract.lastPrice;
    const ask = contract.ask ?? contract.lastPrice;
    const midpoint = (bid != null && ask != null) ? (bid + ask) / 2 : contract.lastPrice;
    return {
        contractSymbol: contract.contractSymbol,
        expiration: normalizeDate(contract.expiration ?? contract.lastTradeDate ?? new Date()),
        strike: Number(contract.strike),
        right,
        lastPrice: contract.lastPrice,
        bid,
        ask,
        midpoint,
        impliedVolatility: contract.impliedVolatility,
        inTheMoney: contract.inTheMoney,
        volume: contract.volume,
        openInterest: contract.openInterest,
    };
}

export async function findOptionContract(
    symbol: string,
    expiration: string,
    strike: number,
    right: OptionRight
): Promise<OptionContractQuote | undefined> {
    const chain = await getOptionChain(symbol, expiration);
    const bucket = right === 'CALL' ? chain.calls : chain.puts;
    return bucket.find(contract => contract.contractSymbol
        && Math.abs(contract.strike - strike) < 1e-6);
}

export async function getRiskFreeRate(): Promise<number> {
    const key = 'riskFree';
    const cached = cacheGet(riskFreeCache, key);
    if (cached != null) return cached;

    try {
        const quote: any = await yahooFinance.quote('^IRX', {}, { validateResult: false });
        const yieldPct = Number(quote?.regularMarketPrice);
        if (Number.isFinite(yieldPct)) {
            const rate = yieldPct / 100;
            cacheSet(riskFreeCache, key, rate, RISK_FREE_TTL_MS);
            return rate;
        }
    } catch (error) {
        // ignore, fallback to default
    }

    const fallback = 0.04;
    cacheSet(riskFreeCache, key, fallback, RISK_FREE_TTL_MS);
    return fallback;
}

export function clearMarketCaches(): void {
    quoteCache.clear();
    chainCache.clear();
}
