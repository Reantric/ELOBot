export interface Connect4BotStrategy {
    makeMove(board: number[][], validColumns: number[]): Promise<number>;
    getName(): string;
}
