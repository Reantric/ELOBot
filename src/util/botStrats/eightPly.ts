// ../../strategies/TwelvePlyStrategy.ts
import { BotStrategy } from "../../models/BotStrategy";

/**
 * Helper interface for returning a move.
 */
interface Move {
    pileIndex: number;
    sticksToRemove: number;
}

/**
 * A simple data structure to track whose turn it is.
 */
enum PlayerTurn {
    AI = "AI",   
    OPPONENT = "OPPONENT",
}

export class EightPlyStrategy implements BotStrategy {
    private readonly MAX_DEPTH = 8;
    private cache: Map<string, number>; // Cache for memoization

    constructor() {
        this.cache = new Map<string, number>();
    }

    /**
     * The main entry point. Called by the bot engine to get a move.
     */
    public async makeMove(piles: number[]): Promise<{ pileIndex: number; sticksToRemove: number }> {
        // Clear the cache before each new move decision
        this.cache.clear();

        // We do a minimax (or negamax) style search with depth = this.MAX_DEPTH
        // We'll treat "AI" as the maximizing player, "OPPONENT" as the minimizing player.

        // Check if there is any valid move to make:
        const possibleMoves = this.generateMoves(piles);
        if (possibleMoves.length === 0) {
            throw new Error("No valid moves left.");
        }

        let bestMove: Move | null = null;
        let bestScore = -Infinity;

        for (const move of possibleMoves) {
            // Apply this move to a copy of the game state
            const nextPiles = [...piles];
            nextPiles[move.pileIndex] -= move.sticksToRemove;

            // Evaluate recursively with one less depth, switching turn to opponent
            const score = this.minimax(nextPiles, this.MAX_DEPTH - 1, PlayerTurn.OPPONENT);

            // We want to maximize the AI's final score
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }

        // If for some reason we failed to pick a best move, pick randomly
        if (!bestMove) {
            console.log("Failed to pick best move; picking randomly.");
            const randomMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
            return { pileIndex: randomMove.pileIndex, sticksToRemove: randomMove.sticksToRemove };
        }

        return { pileIndex: bestMove.pileIndex, sticksToRemove: bestMove.sticksToRemove };
    }

    /**
     * Recursive minimax evaluation with memoization.
     * - If it's AI's turn, we pick the move that yields the highest score.
     * - If it's Opponent's turn, we pick the move that yields the lowest score.
     */
    private minimax(piles: number[], depth: number, currentPlayer: PlayerTurn): number {
        // Generate a unique key for the current game state and player
        const key = this.generateCacheKey(piles, currentPlayer);

        // Check if the result is already in the cache
        if (this.cache.has(key)) {
            return this.cache.get(key)!;
        }

        // If game is over or we've reached max depth, evaluate
        if (this.isGameOver(piles)) {
            const terminalScore = this.evaluateTerminal(piles, currentPlayer);
            this.cache.set(key, terminalScore);
            return terminalScore;
        }
        if (depth === 0) {
            // Heuristic evaluation can be improved; currently returns 0
            this.cache.set(key, 0);
            return 0;
        }

        // Generate all possible moves
        const moves = this.generateMoves(piles);
        if (moves.length === 0) {
            // No valid moves => the game ends, so evaluate
            const terminalScore = this.evaluateTerminal(piles, currentPlayer);
            this.cache.set(key, terminalScore);
            return terminalScore;
        }

        let evalScore: number;

        if (currentPlayer === PlayerTurn.AI) {
            // Maximizing player
            let maxEval = -Infinity;
            for (const move of moves) {
                const nextPiles = [...piles];
                nextPiles[move.pileIndex] -= move.sticksToRemove;
                const score = this.minimax(nextPiles, depth - 1, PlayerTurn.OPPONENT);
                maxEval = Math.max(maxEval, score);

                // Optional short-circuit: if we find a winning position, we can prune
                if (maxEval === Infinity) {
                    break;
                }
            }
            evalScore = maxEval;
        } else {
            // Minimizing player
            let minEval = Infinity;
            for (const move of moves) {
                const nextPiles = [...piles];
                nextPiles[move.pileIndex] -= move.sticksToRemove;
                const score = this.minimax(nextPiles, depth - 1, PlayerTurn.AI);
                minEval = Math.min(minEval, score);

                // Optional short-circuit: if we find a losing position for us, we can prune
                if (minEval === -Infinity) {
                    break;
                }
            }
            evalScore = minEval;
        }

        // Store the evaluated score in the cache before returning
        this.cache.set(key, evalScore);
        return evalScore;
    }

    /**
     * Generate a unique key for the cache based on the game state and current player.
     */
    private generateCacheKey(piles: number[], currentPlayer: PlayerTurn): string {
        // Using JSON.stringify to serialize the piles array and include the current player
        return `${JSON.stringify(piles)}_${currentPlayer}`;
    }

    /**
     * Evaluate the position if the game is over. 
     * If piles are empty, that means the player who just moved took the last stick(s).
     * - Typically, in Nim, the one taking the last stick(s) is the winner.
     */
    private evaluateTerminal(piles: number[], currentPlayer: PlayerTurn): number {
        // If all piles are empty => the last move was made by "the other player".
        // So let's see: if the game just ended and it's AI's turn, that means opponent took the last stick. We lost.
        // Conversely, if it's Opponent's turn, that means AI took the last stick. We won.

        if (!this.isGameOver(piles)) {
            // Not truly terminal; treat as neutral
            return 0;
        }

        // If it's AI's turn, that means the opponent just moved => Opponent wins => -Infinity
        // If it's Opponent's turn, that means the AI just moved => AI wins => +Infinity
        return currentPlayer === PlayerTurn.AI ? -Infinity : Infinity;
    }

    /**
     * Generate all valid moves for the current state.
     */
    private generateMoves(piles: number[]): Move[] {
        const moves: Move[] = [];
        for (let i = 0; i < piles.length; i++) {
            const pileSize = piles[i];
            if (pileSize > 0) {
                for (let removeCount = 1; removeCount <= pileSize; removeCount++) {
                    moves.push({ pileIndex: i, sticksToRemove: removeCount });
                }
            }
        }
        return moves;
    }

    /**
     * Check if the game is over (all piles are empty).
     */
    private isGameOver(piles: number[]): boolean {
        return piles.every((p) => p === 0);
    }
}
