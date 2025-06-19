import { Connect4BotStrategy } from "../../models/Connect4BotStrategy";

export default class Connect4SmartStrategy implements Connect4BotStrategy {
    getName(): string {
        return "12ply";
    }

    async makeMove(board: number[][], validColumns: number[]): Promise<number> {
        const ROWS = 6;
        const COLS = 7;

        // First, check if we can win
        for (const col of validColumns) {
            const row = this.getDropRow(board, col);
            if (row !== -1) {
                // Simulate placing our piece (bot is player 2)
                board[row][col] = 2;
                if (this.checkWin(board, row, col, 2)) {
                    board[row][col] = 0; // Undo simulation
                    return col; // Winning move!
                }
                board[row][col] = 0; // Undo simulation
            }
        }

        // Second, check if we need to block opponent's win
        for (const col of validColumns) {
            const row = this.getDropRow(board, col);
            if (row !== -1) {
                // Simulate placing opponent's piece (player 1)
                board[row][col] = 1;
                if (this.checkWin(board, row, col, 1)) {
                    board[row][col] = 0; // Undo simulation
                    return col; // Block opponent's win
                }
                board[row][col] = 0; // Undo simulation
            }
        }

        // Third, prefer center columns (better strategic positions)
        const centerCols = validColumns.filter(col => col >= 2 && col <= 4);
        if (centerCols.length > 0) {
            return centerCols[Math.floor(Math.random() * centerCols.length)];
        }

        // Fall back to random valid move
        return validColumns[Math.floor(Math.random() * validColumns.length)];
    }

    private getDropRow(board: number[][], col: number): number {
        for (let row = 5; row >= 0; row--) {
            if (board[row][col] === 0) {
                return row;
            }
        }
        return -1; // Column is full
    }

    private checkWin(board: number[][], row: number, col: number, player: number): boolean {
        // Check all four directions: horizontal, vertical, diagonal /, diagonal \
        const directions = [
            [0, 1],   // horizontal
            [1, 0],   // vertical
            [1, 1],   // diagonal \
            [1, -1]   // diagonal /
        ];

        for (const [dr, dc] of directions) {
            let count = 1; // Count the current piece

            // Check positive direction
            for (let i = 1; i < 4; i++) {
                const newRow = row + dr * i;
                const newCol = col + dc * i;
                if (newRow >= 0 && newRow < 6 && 
                    newCol >= 0 && newCol < 7 && 
                    board[newRow][newCol] === player) {
                    count++;
                } else {
                    break;
                }
            }

            // Check negative direction
            for (let i = 1; i < 4; i++) {
                const newRow = row - dr * i;
                const newCol = col - dc * i;
                if (newRow >= 0 && newRow < 6 && 
                    newCol >= 0 && newCol < 7 && 
                    board[newRow][newCol] === player) {
                    count++;
                } else {
                    break;
                }
            }

            if (count >= 4) {
                return true;
            }
        }

        return false;
    }
}
