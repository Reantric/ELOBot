import { NimBotStrategy } from "../../models/NimBotStrategy";

export default class RandomStrategy implements NimBotStrategy {
    getName(): string {
        return "Random";
    }
    getDescription(): string {
        return "A simple strategy that randomly selects a non-empty pile and removes a random number of sticks from it.";
    }
    async makeMove(piles: number[]): Promise<{ pileIndex: number; sticksToRemove: number }> {
        // Select a random non-empty pile
        const nonEmptyPiles = piles
            .map((pile, index) => ({ pile, index }))
            .filter(p => p.pile > 0);

        if (nonEmptyPiles.length === 0) {
            throw new Error("No valid moves left.");
        }

        const selectedPile = nonEmptyPiles[Math.floor(Math.random() * nonEmptyPiles.length)];

        // Remove a random number of sticks from the selected pile
        const sticksToRemove = Math.floor(Math.random() * selectedPile.pile) + 1;

        return { pileIndex: selectedPile.index, sticksToRemove };
    }
}
