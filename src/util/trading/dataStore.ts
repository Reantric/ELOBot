import { QuickDB } from 'quick.db';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    AccountSettings,
    AssetType,
    NetWorthSnapshot,
    Position,
    OptionPosition,
    TradingAccount,
    Trade,
    TradeSide,
    PendingOptionOrder,
} from './types.js';

const db = new QuickDB();
const tradingTable = db.table('paperTrading');
const TEST_ACCOUNT_ID = '1134353765240160346';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TWR_CSV_PATHS = [
    path.resolve(__dirname, 'twr.csv'),
    path.resolve(process.cwd(), 'src/util/trading/twr.csv'),
];
interface TwrEntry {
    timestamp: number;
    twr: number;
    netWorth: number;
}

let cachedTwrSeries: TwrEntry[] | null = null;

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
    };
}

function migrateAccount(raw: any, userId: string): TradingAccount {
    if (!raw) {
        return newAccount(userId);
    }

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
        pendingOrders: raw.pendingOrders ?? [],
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

    seedTestAccount(account);

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

export { DEFAULT_SETTINGS, TEST_ACCOUNT_ID };

function seedTestAccount(account: TradingAccount) {
    if (account.userId !== TEST_ACCOUNT_ID) {
        return;
    }

    if ((account as any).mockSeeded) {
        return;
    }

    const initialCash = account.settings.initialCash ?? DEFAULT_SETTINGS.initialCash;
    account.cash = initialCash;
    account.buyingPower = initialCash;
    account.positions = {};
    account.tradeHistory = [];

    const twrSeries = loadTwrSeries();
    if (twrSeries.length > 0) {
        const cash = account.cash;
        account.netWorthHistory = twrSeries.map((entry, index) => {
            const previous = index > 0 ? twrSeries[index - 1] : null;
            const prevTwr = previous ? previous.twr : 0;
            const dailyFactor = (1 + entry.twr) / (previous ? 1 + prevTwr : 1);
            const dailyReturn = dailyFactor - 1;
            return {
                timestamp: entry.timestamp,
                cash,
                positionsValue: 0,
                netWorth: initialCash,
                realizedPnl: account.realizedPnl ?? 0,
                dailyReturn,
                cumulativeReturn: entry.twr,
                twr: entry.twr,
            };
        });
        account.twr = twrSeries[twrSeries.length - 1]?.twr ?? 0;
        account.twrFactors = twrSeries.map((entry, index) => {
            const prev = index > 0 ? twrSeries[index - 1] : null;
            const prevTwr = prev ? prev.twr : 0;
            return (1 + entry.twr) / (prev ? 1 + prevTwr : 1);
        }).slice(-1000);
        account.lastMark = twrSeries[twrSeries.length - 1]?.timestamp ?? Date.now();
    }

    (account as any).mockSeeded = true;
}

function loadTwrSeries(): TwrEntry[] {
    if (cachedTwrSeries) {
        return cachedTwrSeries;
    }
    const existingPath = TWR_CSV_PATHS.find(p => fs.existsSync(p));
    if (!existingPath) {
        cachedTwrSeries = [];
        return cachedTwrSeries;
    }

    const lines = fs.readFileSync(existingPath, 'utf8').trim().split(/\r?\n/);
    const header = lines.shift();
    if (!header) {
        cachedTwrSeries = [];
        return cachedTwrSeries;
    }

    const initialCash = DEFAULT_SETTINGS.initialCash;
    cachedTwrSeries = lines.map(line => {
        const [timestampStr, twrStr] = line.split(',');
        const date = new Date(`${timestampStr}T13:30:00Z`).getTime();
        const twr = Number(twrStr);
        return { timestamp: date, twr, netWorth: initialCash };
    }).filter(entry => Number.isFinite(entry.timestamp) && Number.isFinite(entry.twr));

    return cachedTwrSeries;
}
