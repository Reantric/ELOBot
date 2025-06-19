import { Connect4BotStrategy } from "../../models/Connect4BotStrategy";

export default class Connect4RandomStrategy implements Connect4BotStrategy {
    getName(): string {
        return "Random";
    }

    async makeMove(board: number[][], validColumns: number[]): Promise<number> {
        // Simple random move from valid columns
        const randomIndex = Math.floor(Math.random() * validColumns.length);
        return validColumns[randomIndex];
    }
}
