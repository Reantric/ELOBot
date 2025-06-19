import { User } from "discord.js";

export enum GameStatus {
    WAITING = "waiting",
    PLAYING = "playing", 
    FINISHED = "finished"
}

export enum CellState {
    EMPTY = 0,
    PLAYER1 = 1,
    PLAYER2 = 2
}

export class Connect4Game {
    public readonly ROWS = 6;
    public readonly COLS = 7;
    public grid: CellState[][];
    public currentPlayer: 1 | 2;
    public status: GameStatus;
    public player1: User;
    public player2: User | null;
    public winner: User | null;
    public gameId: string;
    public isPlayer2Bot: boolean;
    public botName?: string;

    constructor(player1: User, gameId: string, isPlayer2Bot: boolean = false, botName?: string) {
        this.grid = Array(this.ROWS).fill(null).map(() => Array(this.COLS).fill(CellState.EMPTY));
        this.currentPlayer = 1;
        this.status = GameStatus.WAITING;
        this.player1 = player1;
        this.player2 = null;
        this.winner = null;
        this.gameId = gameId;
        this.isPlayer2Bot = isPlayer2Bot;
        this.botName = botName;
        
        if (isPlayer2Bot && botName) {
            // Create a fake user object for the bot
            this.player2 = {
                id: `bot_${gameId}`,
                username: botName,
                bot: true
            } as User;
            this.status = GameStatus.PLAYING;
        }
    }

    public addPlayer2(player2: User): boolean {
        if (this.status !== GameStatus.WAITING || this.player2) {
            return false;
        }
        this.player2 = player2;
        this.status = GameStatus.PLAYING;
        return true;
    }

    public getCurrentPlayer(): User {
        return this.currentPlayer === 1 ? this.player1 : this.player2!;
    }

    public makeMove(column: number): { success: boolean; row?: number; winner?: boolean; draw?: boolean } {
        if (this.status !== GameStatus.PLAYING || column < 0 || column >= this.COLS) {
            return { success: false };
        }

        // Find the lowest empty row in the column
        let row = -1;
        for (let r = this.ROWS - 1; r >= 0; r--) {
            if (this.grid[r][column] === CellState.EMPTY) {
                row = r;
                break;
            }
        }

        if (row === -1) {
            return { success: false }; // Column is full
        }

        // Place the piece
        this.grid[row][column] = this.currentPlayer;

        // Check for win
        const winner = this.checkWin(row, column);
        const draw = !winner && this.isBoardFull();

        if (winner || draw) {
            this.status = GameStatus.FINISHED;
            if (winner) {
                this.winner = this.getCurrentPlayer();
            }
        } else {
            // Switch player
            this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        }

        return { 
            success: true, 
            row, 
            winner: !!winner, 
            draw 
        };
    }

    private checkWin(row: number, col: number): boolean {
        const player = this.grid[row][col];
        if (player === CellState.EMPTY) return false;

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
                if (newRow >= 0 && newRow < this.ROWS && 
                    newCol >= 0 && newCol < this.COLS && 
                    this.grid[newRow][newCol] === player) {
                    count++;
                } else {
                    break;
                }
            }

            // Check negative direction
            for (let i = 1; i < 4; i++) {
                const newRow = row - dr * i;
                const newCol = col - dc * i;
                if (newRow >= 0 && newRow < this.ROWS && 
                    newCol >= 0 && newCol < this.COLS && 
                    this.grid[newRow][newCol] === player) {
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

    private isBoardFull(): boolean {
        return this.grid[0].every(cell => cell !== CellState.EMPTY);
    }

    public getValidMoves(): number[] {
        const validMoves: number[] = [];
        for (let col = 0; col < this.COLS; col++) {
            if (this.grid[0][col] === CellState.EMPTY) {
                validMoves.push(col);
            }
        }
        return validMoves;
    }

    public getBoardState(): CellState[][] {
        return this.grid.map(row => [...row]);
    }
}