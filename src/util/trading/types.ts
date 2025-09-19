export type AssetType = 'EQUITY' | 'OPTION';
export type OptionRight = 'CALL' | 'PUT';
export type TradeSide = 'BUY' | 'SELL';

export interface PositionBase {
    assetType: AssetType;
    symbol: string;
    quantity: number; // Shares or contracts (positive only for longs)
    avgCost: number; // Per-share/contract cost basis
}

export interface EquityPosition extends PositionBase {
    assetType: 'EQUITY';
}

export interface OptionPosition extends PositionBase {
    assetType: 'OPTION';
    contractSymbol: string;
    expiration: string; // YYYY-MM-DD
    strike: number;
    right: OptionRight;
    multiplier: number; // Usually 100
    lastUnderlying?: number;
    lastMark?: number;
    lastImpliedVol?: number;
}

export type Position = EquityPosition | OptionPosition;

export interface Trade {
    id: string;
    timestamp: number;
    side: TradeSide;
    assetType: AssetType;
    symbol: string;
    contractSymbol?: string;
    quantity: number;
    price: number;
    notional: number;
    fees: number;
}

export interface NetWorthSnapshot {
    timestamp: number;
    cash: number;
    positionsValue: number;
    netWorth: number;
    realizedPnl: number;
    dailyReturn?: number;
    cumulativeReturn?: number;
    twr?: number;
}

export interface AccountSettings {
    initialCash: number;
    optionMultiplier: number;
    riskFreeRate: number;
}

export interface TradingAccount {
    userId: string;
    cash: number;
    buyingPower: number;
    positions: Record<string, Position>;
    tradeHistory: Trade[];
    netWorthHistory: NetWorthSnapshot[];
    realizedPnl: number;
    twr: number;
    twrFactors: number[];
    settings: AccountSettings;
    lastMark?: number;
}

export interface PriceQuote {
    symbol: string;
    price: number;
    currency: string;
    regularMarketTime: number;
    previousClose?: number;
    change?: number;
    changePercent?: number;
}

export interface OptionContractQuote {
    contractSymbol: string;
    expiration: string;
    strike: number;
    right: OptionRight;
    lastPrice?: number;
    bid?: number;
    ask?: number;
    midpoint?: number;
    impliedVolatility?: number;
    inTheMoney?: boolean;
    volume?: number;
    openInterest?: number;
}

export interface OptionChain {
    underlyingSymbol: string;
    expirationDates: string[];
    calls: OptionContractQuote[];
    puts: OptionContractQuote[];
}

export interface Greeks {
    delta: number;
    gamma: number;
    vega: number;
    theta: number;
    rho: number;
    Nd1: number;
    d1: number;
    d2: number;
}
