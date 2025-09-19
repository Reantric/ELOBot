export type AssetType = 'EQUITY' | 'OPTION';
export type OptionRight = 'CALL' | 'PUT';
export type TradeSide = 'BUY' | 'SELL';

export interface PositionBase {
    assetType: AssetType;
    symbol: string;
    quantity: number; // Shares or contracts (positive for longs, negative for shorts)
    avgCost: number; // Per-share/contract cost basis (absolute entry price)
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

export interface PendingOptionOrder {
    id: string;
    assetType: 'OPTION';
    userId: string;
    symbol: string;
    expiration: string;
    strike: number;
    right: OptionRight;
    side: TradeSide;
    limitPrice: number;
    quantity: number;
    multiplier: number;
    createdAt: number;
    status: 'OPEN' | 'FILLED';
    fillPrice?: number;
    filledAt?: number;
}

export interface PendingEquityOrder {
    id: string;
    assetType: 'EQUITY';
    userId: string;
    symbol: string;
    side: TradeSide;
    limitPrice: number;
    quantity: number;
    createdAt: number;
    status: 'OPEN' | 'FILLED';
    fillPrice?: number;
    filledAt?: number;
}

export type PendingOrder = PendingOptionOrder | PendingEquityOrder;

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
    pendingOrders: PendingOrder[];
    mockSeeded?: boolean;
    testAccountInitialized?: boolean;
}

export interface PriceQuote {
    symbol: string;
    price: number;
    currency: string;
    regularMarketTime: number;
    previousClose?: number;
    change?: number;
    changePercent?: number;
    dayHigh?: number;
    dayLow?: number;
    dayOpen?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    preMarketPrice?: number;
    preMarketChange?: number;
    preMarketChangePercent?: number;
    postMarketPrice?: number;
    postMarketChange?: number;
    postMarketChangePercent?: number;
    volume?: number;
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
