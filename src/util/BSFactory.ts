import { BotStrategy } from "../models/BotStrategy.js";
import { EightPlyStrategy } from "./botStrats/eightPly.js";
import { GeminiStrategy } from "./botStrats/geminiStrategy.js";
import { RandomStrategy } from "./botStrats/Random.js";
import { TwelvePlyStrategy } from "./botStrats/twelvePly.js";
import { TwoPlyStrategy } from "./botStrats/twoPly.js";
export enum BotProfile {
    None = "None",
    Random = "Random",
    TwoPly = "2ply",
    EightPly = "8ply",
    TwelvePly = "12ply",
    Gemini = "Gemini",
}

export function getRandomBotProfile(): BotProfile {
    // Retrieve all values from the enum
    const values = Object.values(BotProfile);

    // Filter out 'None'
    const filteredValues = values.filter(
        (value) => value !== BotProfile.None
    ) as BotProfile[];

    // Safety check
    if (filteredValues.length === 0) {
        throw new Error("No BotProfiles available for selection.");
    }

    // Select a random index from the filtered array
    const randomIndex = Math.floor(Math.random() * filteredValues.length);

    // Return the randomly selected BotProfile
    return filteredValues[randomIndex];
}

export class BotStrategyFactory { // automate this eventually looking at files in the botStrats folder
    static async getStrategy(profile: BotProfile): Promise<BotStrategy> {
        switch (profile) {
            case BotProfile.Random:
                return new RandomStrategy();
            case BotProfile.TwoPly:
                return new TwoPlyStrategy();
            case BotProfile.EightPly:
                return new EightPlyStrategy();
            case BotProfile.TwelvePly:
                return new TwelvePlyStrategy();
            case BotProfile.Gemini:
                return new GeminiStrategy();
            default:
                throw new Error("Invalid BotProfile.");
        }
    }
}
