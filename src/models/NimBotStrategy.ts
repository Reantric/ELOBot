export interface NimBotStrategy {
    makeMove(piles: number[]): Promise<{ pileIndex: number; sticksToRemove: number }>;
    getName(): string;
    getDescription(): string;
}
