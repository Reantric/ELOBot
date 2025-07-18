import { NimBotStrategy } from "../../models/NimBotStrategy";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync } from "fs";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export default class GeminiStrategy implements NimBotStrategy {
    private model;

    constructor() {
        const systemMessage = `You are an assistant that helps play a stick-removal game. Given the current state of the game represented by an array of pile sizes, return your move as a JSON object with the following structure: { "pileIndex": <number>, "sticksToRemove": <number> }. Ensure that:
- "pileIndex" is the index of a non-empty pile.
- "sticksToRemove" is at least 1 and no more than the number of sticks in the selected pile.
- The response contains only the JSON object without any additional text or explanations.`;

        this.model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: systemMessage
        });
    }
    getName(): string {
        return "Gemini";
    }
    getDescription(): string {
        return "A strategy that uses Google Gemini AI to generate moves in the Nim game. It provides a JSON response with the pile index and number of sticks to remove.";
    }

    async makeMove(piles: number[]): Promise<{ pileIndex: number; sticksToRemove: number }> {
        // Prepare the prompt with the current game state
        const prompt = `Current piles: [${piles.join(", ")}]
Provide your move as a JSON object with "pileIndex" and "sticksToRemove". Just the raw code please, no \`\`\`JSON tags or wrapping it in a code block. So like just return 
{
  "pileIndex": whatever you choose,
  "sticksToRemove": whatever you choose
} in this exact format. No code blocks. Play as well as you can.`;

        try {
            const result = await this.model.generateContent([prompt]);
            const response = await result.response;
            let text = response.text().trim();
            

            console.log("Gemini response: " + text);

            // Use regex to extract the JSON object from the response, even if it's wrapped in markdown
            const jsonMatch = text.match(/{[\s\S]*}/);
            if (jsonMatch) {
                text = jsonMatch[0];
            }

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