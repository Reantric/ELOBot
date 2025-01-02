export interface BotStrategy {
    makeMove(piles: number[]): Promise<{ pileIndex: number; sticksToRemove: number }>;
}
