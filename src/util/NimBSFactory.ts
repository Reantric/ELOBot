import { NimBotStrategy } from "../models/NimBotStrategy.js";
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as path from 'path';



export class NimBotStrategyFactory { // automate this eventually looking at files in the botStrats folder
    private static instance: NimBotStrategyFactory;
    NimStrategies: NimBotStrategy[] = [];
    private initialized = false;
    
    private constructor() {} // Private constructor for singleton
    
    static getInstance(): NimBotStrategyFactory {
        if (!NimBotStrategyFactory.instance) {
            NimBotStrategyFactory.instance = new NimBotStrategyFactory();
        }
        return NimBotStrategyFactory.instance;
    }
    
    async init() {
        if (this.initialized) return; // Prevent double initialization
        // Load the bot strategies dynamically
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const nimBotStratsFiles = fs.readdirSync(path.join(__dirname, 'nimBotStrats'));
        const filePath = `${__dirname}/nimBotStrats`; // Adjust the path to your nimBotStrats directory

        for (const botStrat of nimBotStratsFiles as string[]) {
            // Import the strategy classes dynamically
            const stratClass = (await import(`${filePath}/${botStrat}`)).default;
            const strat = new stratClass() as NimBotStrategy;
            this.NimStrategies.push(strat);
        }
        
        this.initialized = true;
    }

    getRandomBotStrategy() {

        // Safety check
        if (this.NimStrategies.length === 0) {
            throw new Error("No Nim Strategies available for selection.");
        }
        // Find the Gemini strategy
        const geminiStrategy = this.NimStrategies.find(strat => strat.getName() === "Gemini");
        if (geminiStrategy) {
            return geminiStrategy;
        }

        // Select a random index from the filtered array
        const randomIndex = Math.floor(Math.random() * this.NimStrategies.length);

        // Return the randomly selected BotProfile
        return this.NimStrategies[randomIndex];
    }
}

