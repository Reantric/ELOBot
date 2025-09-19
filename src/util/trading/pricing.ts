import { Greeks } from './types.js';

const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);

function erf(x: number): number {
    const sign = Math.sign(x);
    const absX = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const t = 1 / (1 + p * absX);
    const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return sign * y;
}

function normCdf(x: number): number {
    return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function normPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / SQRT_TWO_PI;
}

export function bsPrice(
    S: number,
    K: number,
    r: number,
    sigma: number,
    T: number,
    isCall: boolean
): number {
    if (sigma <= 0 || T <= 0) {
        return Math.max(isCall ? S - K : K - S, 0);
    }
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    if (isCall) {
        return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
    }
    return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

export function bsGreeks(
    S: number,
    K: number,
    r: number,
    sigma: number,
    T: number,
    isCall: boolean
): Greeks {
    const sqrtT = Math.sqrt(Math.max(T, 1e-6));
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    const pdf = normPdf(d1);

    const delta = isCall ? normCdf(d1) : normCdf(d1) - 1;
    const gamma = pdf / (S * sigma * sqrtT);
    const vega = S * pdf * sqrtT;
    const theta = isCall
        ? -(S * pdf * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * normCdf(d2)
        : -(S * pdf * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * normCdf(-d2);
    const rho = (isCall
        ? K * Math.exp(-r * T) * normCdf(d2)
        : -K * Math.exp(-r * T) * normCdf(-d2)) * T;

    return { delta, gamma, vega, theta, rho, Nd1: normCdf(isCall ? d1 : -d1), d1, d2 };
}

export function impliedVol(
    S: number,
    K: number,
    r: number,
    T: number,
    isCall: boolean,
    targetPrice: number,
    low = 1e-4,
    high = 5,
    tol = 1e-4,
    maxIter = 100
): number {
    let lo = low;
    let hi = high;
    let mid = (lo + hi) / 2;

    const price = (vol: number) => bsPrice(S, K, r, vol, T, isCall) - targetPrice;
    let fLo = price(lo);
    let fHi = price(hi);

    if (fLo * fHi > 0) {
        return NaN;
    }

    for (let i = 0; i < maxIter; i += 1) {
        mid = (lo + hi) / 2;
        const fMid = price(mid);
        if (Math.abs(fMid) < tol) {
            break;
        }
        if (fLo * fMid <= 0) {
            hi = mid;
            fHi = fMid;
        } else {
            lo = mid;
            fLo = fMid;
        }
    }

    return mid;
}
