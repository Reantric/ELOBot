import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { Connect4BotStrategy } from '../models/Connect4BotStrategy';

export class Connect4StrategyFactory { // automate this eventually looking at files in the botStrats folder
    private static instance: Connect4StrategyFactory;
    C4Strategies: Connect4BotStrategy[] = [];
    private initialized = false;
    
    private constructor() {} // Private constructor for singleton
    
    static getInstance(): Connect4StrategyFactory {
        if (!Connect4StrategyFactory.instance) {
            Connect4StrategyFactory.instance = new Connect4StrategyFactory();
        }
        return Connect4StrategyFactory.instance;
    }
    
    async init() {
        if (this.initialized) return; // Prevent double initialization
        // Load the bot strategies dynamically
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const C4BotStratsFiles = fs.readdirSync(path.join(__dirname, 'connect4BotStrats'));
        const filePath = `${__dirname}/connect4BotStrats`; // Adjust the path to your connect4BotStrats directory

        for (const botStrat of C4BotStratsFiles as string[]) {
            // Import the strategy classes dynamically
            const stratClass = (await import(`${filePath}/${botStrat}`)).default;
            const strat = new stratClass() as Connect4BotStrategy;
            this.C4Strategies.push(strat);
        }
        
        this.initialized = true;
        console.log(`✅ Loaded ${this.C4Strategies.length} Connect4 bot strategies`);
    }

    getRandomBotStrategy(): Connect4BotStrategy {
        // Safety check
        if (this.C4Strategies.length === 0) {
            throw new Error("No C4 Strategies available for selection.");
        }

        // Select a random index from the filtered array
        const randomIndex = Math.floor(Math.random() * this.C4Strategies.length);

        // Return the randomly selected BotStrategy
        return this.C4Strategies[randomIndex];
    }

    static async getStrategy(profileName: string): Promise<Connect4BotStrategy> {
        const factory = Connect4StrategyFactory.getInstance();
        await factory.init();
        
        // Find strategy by name (case insensitive)
        const strategy = factory.C4Strategies.find(strat => 
            strat.getName().toLowerCase().includes(profileName.toLowerCase())
        );
        
        if (strategy) {
            return strategy;
        }
        
        // If no specific strategy found, return random
        console.log(`⚠️ Connect4 strategy '${profileName}' not found, using random strategy`);
        return factory.getRandomBotStrategy();
    }
}

// Main factory export for backwards compatibility
export const Connect4BotStrategyFactory = Connect4StrategyFactory;

