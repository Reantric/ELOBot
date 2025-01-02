import { BotStrategy } from "../../models/BotStrategy";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync } from "fs";
const genAI = new GoogleGenerativeAI("AIzaSyBv0y1ri9woqXzPouncQWZiH8fbxgGJZQo");

export class GeminiStrategy implements BotStrategy {
    private model;

    constructor() {
        const systemMessage = `You are an assistant that helps play a stick-removal game. Given the current state of the game represented by an array of pile sizes, return your move as a JSON object with the following structure: { "pileIndex": <number>, "sticksToRemove": <number> }. Ensure that:
- "pileIndex" is the index of a non-empty pile.
- "sticksToRemove" is at least 1 and no more than the number of sticks in the selected pile.
- The response contains only the JSON object without any additional text or explanations.`;

        this.model = genAI.getGenerativeModel({
            model: "gemini-1.5-pro-latest",
            systemInstruction: systemMessage
        });
    }

    async makeMove(piles: number[]): Promise<{ pileIndex: number; sticksToRemove: number }> {
        // Prepare the prompt with the current game state
        const prompt = `Current piles: [${piles.join(", ")}]
Provide your move as a JSON object with "pileIndex" and "sticksToRemove".`;

        try {
            const result = await this.model.generateContent([prompt]);
            const response = await result.response;
            const text = response.text().trim();

            // Validate and parse the response
            const move = JSON.parse(text);

            // Validate the move structure
            if (
                typeof move.pileIndex !== 'number' ||
                typeof move.sticksToRemove !== 'number' ||
                move.pileIndex < 0 ||
                move.pileIndex >= piles.length ||
                move.sticksToRemove < 1 ||
                move.sticksToRemove > piles[move.pileIndex]
            ) {
                throw new Error("Invalid move received from Gemini.");
            }

            return { pileIndex: move.pileIndex, sticksToRemove: move.sticksToRemove };
        } catch (error) {
            console.error("Error generating move with Gemini:", error);
            throw new Error("Failed to generate a valid move.");
        }
    }
}