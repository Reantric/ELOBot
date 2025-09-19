export function toDate(value: string | number | Date): Date {
    if (value instanceof Date) return new Date(value.getTime());
    if (typeof value === 'number') return new Date(value);
    return new Date(`${value}T00:00:00Z`);
}

export function startOfDayUtc(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000);
}

export function businessDaysBetween(start: Date, end: Date): number {
    const s = startOfDayUtc(start);
    const e = startOfDayUtc(end);
    if (e <= s) return 0;

    let total = 0;
    let cursor = new Date(s.getTime());

    while (cursor < e) {
        const day = cursor.getUTCDay();
        if (day !== 0 && day !== 6) {
            total += 1;
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return total;
}

export function yearFractionBusinessDays(start: Date, end: Date, tradingDaysPerYear = 252): number {
    const businessDays = businessDaysBetween(start, end);
    return businessDays / tradingDaysPerYear;
}

export function timeToExpiry(expiration: string, valuationDate: Date = new Date()): number {
    const expiryDate = startOfDayUtc(toDate(expiration));
    const valDate = startOfDayUtc(valuationDate);
    const yearFraction = yearFractionBusinessDays(valDate, expiryDate);
    const minT = 1 / 365;
    return Math.max(yearFraction, minT);
}
