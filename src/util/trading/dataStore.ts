import { QuickDB } from 'quick.db';
import { randomUUID } from 'crypto';
import {
    AccountSettings,
    AssetType,
    NetWorthSnapshot,
    Position,
    OptionPosition,
    PendingOrder,
    PendingEquityOrder,
    PendingOptionOrder,
    TradingAccount,
    Trade,
    TradeSide,
} from './types.js';

const db = new QuickDB();
const tradingTable = db.table('paperTrading');

const DEFAULT_SETTINGS: AccountSettings = {
    initialCash: 100_000,
    optionMultiplier: 100,
    riskFreeRate: 0.04,
};

function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function newAccount(userId: string): TradingAccount {
    const timestamp = Date.now();
    const netWorthSnapshot: NetWorthSnapshot = {
        timestamp,
        cash: DEFAULT_SETTINGS.initialCash,
        positionsValue: 0,
        netWorth: DEFAULT_SETTINGS.initialCash,
        realizedPnl: 0,
        dailyReturn: 0,
        cumulativeReturn: 0,
        twr: 0,
    };

    return {
        userId,
        cash: DEFAULT_SETTINGS.initialCash,
        buyingPower: DEFAULT_SETTINGS.initialCash,
        positions: {},
        tradeHistory: [],
        netWorthHistory: [netWorthSnapshot],
        realizedPnl: 0,
        twr: 0,
        twrFactors: [],
        settings: deepClone(DEFAULT_SETTINGS),
        lastMark: timestamp,
        pendingOrders: [],
        mockSeeded: false,
        testAccountInitialized: false,
    };
}

function migrateAccount(raw: any, userId: string): TradingAccount {
    if (!raw) {
        return newAccount(userId);
    }

    const pendingOrders = Array.isArray(raw.pendingOrders)
        ? raw.pendingOrders
            .map(normalizePendingOrder)
            .filter((order: PendingOrder | null): order is PendingOrder => order != null)
        : [];

    const account: TradingAccount = {
        userId,
        cash: typeof raw.cash === 'number' ? raw.cash : DEFAULT_SETTINGS.initialCash,
        buyingPower: typeof raw.buyingPower === 'number' ? raw.buyingPower : (typeof raw.cash === 'number' ? raw.cash : DEFAULT_SETTINGS.initialCash),
        positions: raw.positions ?? {},
        tradeHistory: raw.tradeHistory ?? [],
        netWorthHistory: raw.netWorthHistory ?? [],
        realizedPnl: typeof raw.realizedPnl === 'number' ? raw.realizedPnl : 0,
        twr: typeof raw.twr === 'number' ? raw.twr : 0,
        twrFactors: raw.twrFactors ?? [],
        settings: {
            initialCash: raw?.settings?.initialCash ?? DEFAULT_SETTINGS.initialCash,
            optionMultiplier: raw?.settings?.optionMultiplier ?? DEFAULT_SETTINGS.optionMultiplier,
            riskFreeRate: raw?.settings?.riskFreeRate ?? DEFAULT_SETTINGS.riskFreeRate,
        },
        lastMark: raw.lastMark ?? Date.now(),
        pendingOrders,
        mockSeeded: raw?.mockSeeded === true,
        testAccountInitialized: raw?.testAccountInitialized === true,
    };

    if (!Array.isArray(account.netWorthHistory) || account.netWorthHistory.length === 0) {
        const timestamp = Date.now();
        account.netWorthHistory = [{
            timestamp,
            cash: account.cash,
            positionsValue: 0,
            netWorth: account.cash,
            realizedPnl: account.realizedPnl,
            dailyReturn: 0,
            cumulativeReturn: 0,
            twr: account.twr,
        }];
    }

    // Ensure positions have typed defaults
    account.positions = Object.fromEntries(Object.entries(account.positions).map(([key, pos]: [string, any]) => {
        if (pos.assetType === 'OPTION') {
            const option: OptionPosition = {
                assetType: 'OPTION',
                symbol: pos.symbol,
                quantity: pos.quantity ?? 0,
                avgCost: pos.avgCost ?? 0,
                contractSymbol: pos.contractSymbol ?? key,
                expiration: pos.expiration,
                strike: pos.strike,
                right: pos.right,
                multiplier: pos.multiplier ?? DEFAULT_SETTINGS.optionMultiplier,
                lastUnderlying: pos.lastUnderlying,
                lastMark: pos.lastMark,
                lastImpliedVol: pos.lastImpliedVol,
            };
            return [key, option];
        }
        const simple: Position = {
            assetType: 'EQUITY',
            symbol: pos.symbol,
            quantity: pos.quantity ?? 0,
            avgCost: pos.avgCost ?? 0,
        };
        return [key, simple];
    }));

    ensureLiveTradingState(account);

    return account;
}

export async function getAccount(userId: string): Promise<TradingAccount> {
    const raw = await tradingTable.get(userId);
    return migrateAccount(raw, userId);
}

export async function ensureAccount(userId: string): Promise<TradingAccount> {
    const account = await getAccount(userId);
    await saveAccount(account);
    return account;
}

export async function saveAccount(account: TradingAccount): Promise<void> {
    await tradingTable.set(account.userId, account);
}

export async function listAccounts(): Promise<TradingAccount[]> {
    const entries = await tradingTable.all();
    return entries.map((entry: any) => migrateAccount(entry.value, entry.id));
}

export function positionKey(assetType: AssetType, symbol: string, contractSymbol?: string): string {
    return assetType === 'OPTION' ? `OPTION:${contractSymbol ?? symbol}` : `EQUITY:${symbol}`;
}

export function createTrade(side: TradeSide, params: Omit<Trade, 'id' | 'timestamp' | 'side'>): Trade {
    return {
        id: randomUUID(),
        timestamp: Date.now(),
        side,
        ...params,
    };
}

export function upsertPosition(account: TradingAccount, position: Position): TradingAccount {
    const key = positionKey(position.assetType, position.symbol, position.assetType === 'OPTION' ? position.contractSymbol : undefined);
    account.positions[key] = position;
    return account;
}

export function removePosition(account: TradingAccount, assetType: AssetType, symbol: string, contractSymbol?: string): TradingAccount {
    const key = positionKey(assetType, symbol, contractSymbol);
    delete account.positions[key];
    return account;
}

export function ensureLiveTradingState(account: TradingAccount): boolean {
    if (!account.mockSeeded && !account.testAccountInitialized) {
        return false;
    }

    const timestamp = Date.now();
    const cash = typeof account.cash === 'number' ? account.cash : DEFAULT_SETTINGS.initialCash;
    account.netWorthHistory = [{
        timestamp,
        cash,
        positionsValue: 0,
        netWorth: cash,
        realizedPnl: account.realizedPnl ?? 0,
        dailyReturn: 0,
        cumulativeReturn: 0,
        twr: 0,
    }];
    account.twr = 0;
    account.twrFactors = [];
    account.lastMark = timestamp;
    account.mockSeeded = false;
    account.testAccountInitialized = false;
    return true;
}

export function appendTrade(account: TradingAccount, trade: Trade): TradingAccount {
    account.tradeHistory.unshift(trade);
    if (account.tradeHistory.length > 2000) {
        account.tradeHistory = account.tradeHistory.slice(0, 2000);
    }
    return account;
}

export async function resetAccount(userId: string): Promise<TradingAccount> {
    const fresh = newAccount(userId);
    await saveAccount(fresh);
    return fresh;
}

export { DEFAULT_SETTINGS };

function normalizePendingOrder(order: any): PendingOrder | null {
    if (!order) {
        return null;
    }

    const inferredType = order.assetType === 'EQUITY' ? 'EQUITY' : order.assetType === 'OPTION' ? 'OPTION'
        : (order.strike != null ? 'OPTION' : 'EQUITY');

    const limitPrice = Number(order.limitPrice);
    const quantity = Math.floor(Number(order.quantity ?? 0));
    const createdAt = typeof order.createdAt === 'number' ? order.createdAt : Date.now();
    const fillPrice = Number(order.fillPrice);
    const filledAt = typeof order.filledAt === 'number' ? order.filledAt : undefined;

    if (!Number.isFinite(limitPrice) || !Number.isFinite(quantity) || quantity <= 0) {
        return null;
    }

    const base = {
        id: typeof order.id === 'string' ? order.id : randomUUID(),
        userId: typeof order.userId === 'string' ? order.userId : '',
        symbol: typeof order.symbol === 'string' ? order.symbol.toUpperCase() : '',
        side: order.side === 'SELL' ? 'SELL' as TradeSide : 'BUY' as TradeSide,
        limitPrice,
        quantity,
        createdAt,
        status: order.status === 'FILLED' ? 'FILLED' as const : 'OPEN' as const,
        fillPrice: Number.isFinite(fillPrice) ? fillPrice : undefined,
        filledAt,
    };

    if (!base.userId || !base.symbol) {
        return null;
    }

    if (inferredType === 'OPTION') {
        const expiration = typeof order.expiration === 'string' ? order.expiration : undefined;
        const strike = Number(order.strike);
        const right = order.right === 'PUT' ? 'PUT' as const : 'CALL' as const;
        const multiplier = Math.floor(Number(order.multiplier ?? DEFAULT_SETTINGS.optionMultiplier)) || DEFAULT_SETTINGS.optionMultiplier;
        if (!expiration || !Number.isFinite(strike)) {
            return null;
        }
        const normalized: PendingOptionOrder = {
            ...base,
            assetType: 'OPTION',
            expiration,
            strike,
            right,
            multiplier,
        };
        return normalized;
    }

    const normalized: PendingEquityOrder = {
        ...base,
        assetType: 'EQUITY',
    };
    return normalized;
}
