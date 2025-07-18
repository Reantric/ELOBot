import { QuickDB } from "quick.db";

const db = new QuickDB();

/**
 * Calculates and applies compound interest to the JToH time pool
 * This should be called whenever accessing or modifying JToH time
 * @returns The updated JToH time with interest applied
 */
export async function calculateAndApplyJtohInterest(): Promise<number> {
    const LOG_ID = '1134353765240160346'; // The main JToH time pool
    
    // Get current time and last access date from database
    const currentTime = await db.get(`${LOG_ID}.jtoh`) || 0;
    const lastAccessDate = await db.get(`${LOG_ID}.jtoh_last_access`);
    
    const now = new Date();
    const currentTime_ms = now.getTime();
    
    let timeWithInterest = currentTime;
    
    // Calculate interest if user has accessed before and time > 0
    if (lastAccessDate && currentTime > 0) {
        const lastAccess = new Date(lastAccessDate);
        const lastAccess_ms = lastAccess.getTime();
        
        // Calculate seconds passed (with decimal precision)
        const secondsPassed = (currentTime_ms - lastAccess_ms) / 1000;
        
        if (secondsPassed > 0) {
            // Get interest rate from database (default to 1.16e-7 if not set)
            const interestRate = await db.get('jtoh.interest_rate') || 1.16 * Math.pow(10, -7);
            
            // Apply compound interest per second
            timeWithInterest = currentTime * Math.pow(1 + interestRate, secondsPassed);
            
            console.log(`[JTOH-INTEREST] Applied ${secondsPassed.toFixed(1)}s of interest at rate ${interestRate.toExponential(3)}`);
            console.log(`[JTOH-INTEREST] Time: ${currentTime.toFixed(2)} → ${timeWithInterest.toFixed(2)} minutes`);

            // Update database with interest-applied time
            await db.set(`${LOG_ID}.jtoh`, timeWithInterest);
        }
    }
    
    // Always update the last access timestamp
    await db.set(`${LOG_ID}.jtoh_last_access`, now.toISOString());
    
    return timeWithInterest;
}

/**
 * Gets the current JToH time without applying interest
 * Use this only when you need the raw stored value
 * @returns The raw JToH time from database
 */
export async function getRawJtohTime(): Promise<number> {
    const LOG_ID = '1134353765240160346';
    return await db.get(`${LOG_ID}.jtoh`) || 0;
}

/**
 * Sets the JToH time and updates the timestamp
 * Use this when manually setting the time (like after market resolution)
 * @param newTime The new JToH time value
 */
export async function setJtohTime(newTime: number): Promise<void> {
    const LOG_ID = '1134353765240160346';
    const now = new Date();
    
    await db.set(`${LOG_ID}.jtoh`, newTime);
    await db.set(`${LOG_ID}.jtoh_last_access`, now.toISOString());
    
    console.log(`[JTOH-INTEREST] Set JToH time to ${newTime.toFixed(2)} minutes`);
}
