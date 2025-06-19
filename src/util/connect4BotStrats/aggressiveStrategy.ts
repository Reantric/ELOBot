import { Connect4BotStrategy } from "../../models/Connect4BotStrategy";

export default class Connect4AggressiveStrategy implements Connect4BotStrategy {
    getName(): string {
        return "2ply";
    }

    async makeMove(board: number[][], validColumns: number[]): Promise<number> {
        // First, check if we can win
        for (const col of validColumns) {
            const row = this.getDropRow(board, col);
            if (row !== -1) {
                board[row][col] = 2;
                if (this.checkWin(board, row, col, 2)) {
                    board[row][col] = 0;
                    return col;
                }
                board[row][col] = 0;
            }
        }

        // Second, only block if opponent has immediate win
        for (const col of validColumns) {
            const row = this.getDropRow(board, col);
            if (row !== -1) {
                board[row][col] = 1;
                if (this.checkWin(board, row, col, 1)) {
                    board[row][col] = 0;
                    return col;
                }
                board[row][col] = 0;
            }
        }

        // Third, look for moves that create multiple threats
        let bestCol = validColumns[0];
        let maxThreats = 0;

        for (const col of validColumns) {
            const row = this.getDropRow(board, col);
            if (row !== -1) {
                board[row][col] = 2;
                const threats = this.countThreats(board, row, col, 2);
                if (threats > maxThreats) {
                    maxThreats = threats;
                    bestCol = col;
                }
                board[row][col] = 0;
            }
        }

        return bestCol;
    }

    private getDropRow(board: number[][], col: number): number {
        for (let row = 5; row >= 0; row--) {
            if (board[row][col] === 0) {
                return row;
            }
        }
        return -1;
    }

    private checkWin(board: number[][], row: number, col: number, player: number): boolean {
        const directions = [
            [0, 1], [1, 0], [1, 1], [1, -1]
        ];

        for (const [dr, dc] of directions) {
            let count = 1;

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

    private countThreats(board: number[][], row: number, col: number, player: number): number {
        let threats = 0;
        const directions = [
            [0, 1], [1, 0], [1, 1], [1, -1]
        ];

        for (const [dr, dc] of directions) {
            let count = 1;

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

            if (count >= 3) {
                threats++;
            }
        }
        return threats;
    }
}
