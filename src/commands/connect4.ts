import { Client, ChatInputCommandInteraction,CommandInteraction, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, User, MessageComponentInteraction, TextChannel, ButtonInteraction, Interaction } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { SlashCommandBuilder } from '@discordjs/builders';
import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Connect4Game, CellState, GameStatus } from '../models/Connect4Game.js';
import { Connect4BotStrategy } from '../models/Connect4BotStrategy.js';
import { Connect4BotStrategyFactory } from '../util/Connect4BSFactory.js';
// @ts-ignore
import * as glicko2 from "glicko2";
import { QuickDB } from "quick.db";
import Titles from "../util/Titles.js";

const execAsync = promisify(exec);

const db = new QuickDB();
var history = db.table('history');

// Store active games and their bot strategies
const activeGames = new Map<string, Connect4Game>();
const gameBotStrategies = new Map<string, Connect4BotStrategy>();

export default class Connect4 implements IBotInteraction {

    name(): string {
        return "connect4";
    }

    help(): string {
        return "Play Connect 4! Challenge someone or play against a random bot.";
    }

    cooldown(): number {
        return 5;
    }

    isThisInteraction(command: string): boolean {
        return command === this.name();
    }

    data(): any {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help())
            .addUserOption(option => 
                option.setName('opponent')
                    .setDescription('User to challenge to Connect 4')
                    .setRequired(false)
            );
    }

    perms(): "admin" | "user" | "both" {
        return 'both';
    }

    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        await interaction.deferReply();

        const opponent = interaction.options.get('opponent')?.user as User | undefined;
        const gameId = `${interaction.id}`;
        
        if (opponent) {
            if (opponent.id === interaction.user.id) {
                await interaction.editReply("You can't play against yourself!");
                return;
            }
            if (opponent.bot) {
                await interaction.editReply("You can't play against bots!");
                return;
            }
            
            // Create new game with human opponent
            const game = new Connect4Game(interaction.user, gameId);
            activeGames.set(gameId, game);
            
            // Add opponent and start game
            game.addPlayer2(opponent);
            await this.startGameWithAnimation(interaction, game, Bot);
        } else {
            // No opponent specified - create bot game
            const botStrategy = await Connect4BotStrategyFactory.getInstance().getRandomBotStrategy();
            const botName = botStrategy.getName();
            
            // console.log(`🤖 Creating bot game with ${botName} (Profile: ${botProfile})`);
            
            // Randomly decide who goes first
            const humanGoesFirst = Math.random() < 0.5;
            // console.log(`🎮 Turn order: ${humanGoesFirst ? 'Human first' : 'Bot first'}`);
            
            // Create new game with bot opponent
            const game = new Connect4Game(interaction.user, gameId, true, botName);
            
            // If bot goes first, switch the starting player
            if (!humanGoesFirst) {
                game.currentPlayer = 2;
                // console.log(`🤖 Bot will start first (currentPlayer = ${game.currentPlayer})`);
            }
            
            activeGames.set(gameId, game);
            gameBotStrategies.set(gameId, botStrategy);
            
            // console.log(`📊 Game setup complete. Bot is player 2: ${game.isPlayer2Bot}, Current player: ${game.currentPlayer}`);
            
            await this.startGameWithAnimation(interaction, game, Bot);
        }
    }

    private async waitForOpponent(interaction: CommandInteraction, game: Connect4Game, Bot: Client): Promise<void> {
        const joinButton = new ButtonBuilder()
            .setCustomId(`join_connect4_${game.gameId}`)
            .setLabel('Join Game')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎮');

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton);

        const embed = new EmbedBuilder()
            .setTitle('Connect 4 - Waiting for Opponent')
            .setDescription(`${game.player1} is waiting for an opponent!\nClick the button below to join.`)
            .setColor('Blue');

        await interaction.editReply({
            embeds: [embed],
            components: [row]
        });

        // Set up collector for join button
        const collector = interaction.channel?.createMessageComponentCollector({
            filter: (i) => i.customId === `join_connect4_${game.gameId}`,
            time: 300000 // 5 minutes
        });

        collector?.on('collect', async (i) => {
            if (i.user.id === game.player1.id) {
                await i.reply({ content: "You can't play against yourself!", ephemeral: true });
                return;
            }
            if (i.user.bot) {
                await i.reply({ content: "Bots can't play!", ephemeral: true });
                return;
            }

            if (game.addPlayer2(i.user)) {
                await i.deferUpdate();
                collector.stop();
                await this.startGameWithAnimation(interaction, game, Bot);
            } else {
                await i.reply({ content: "Game is no longer available!", ephemeral: true });
            }
        });

        collector?.on('end', () => {
            if (game.status === GameStatus.WAITING) {
                activeGames.delete(game.gameId);
                interaction.editReply({
                    content: "Game expired - no one joined in time.",
                    embeds: [],
                    components: []
                });
            }
        });
    }

    private async startGameWithAnimation(interaction: CommandInteraction, game: Connect4Game, Bot: Client): Promise<void> {
        const tempDir = path.join(process.cwd(), 'temp', `c4-${game.gameId}`);
        
        try {
            await fs.mkdir(tempDir, { recursive: true });
            
            // Animation commented out for testing core functionality
            // const animationGifPath = await this.generateFallingAnimation(tempDir, game);
            // const animationAttachment = new AttachmentBuilder(animationGifPath, { name: 'connect4-start.gif' });

            const player1Name = game.player1.username;
            const player2Name = game.isPlayer2Bot ? `${game.player2!.username} 🤖` : game.player2!.username;
            
            const embed = new EmbedBuilder()
                .setTitle('Connect 4 Game Started!')
                .setDescription(`${player1Name} vs ${player2Name}\n\nGame ready!`)
                .setColor('Green');

            await interaction.editReply({
                embeds: [embed],
                // files: [animationAttachment],
                components: []
            });

            // Animation wait commented out
            // await new Promise(resolve => setTimeout(resolve, 4000));

            // Show static board and game controls immediately
            await this.showGameBoard(interaction, game, Bot);

        } catch (error) {
            console.error("Error starting Connect 4 game:", error);
            await interaction.editReply("Couldn't start the game. Please try again.");
            activeGames.delete(game.gameId);
        }
    }

    private async generateFallingAnimation(tempDir: string, game: Connect4Game): Promise<string> {
        // Higher resolution settings
        const ROWS = 6;
        const COLS = 7;
        const CELL_SIZE = 200;  // Doubled for higher resolution
        const RADIUS = CELL_SIZE / 2 - 20;  // Adjusted radius
        const WIDTH = COLS * CELL_SIZE;
        const HEIGHT = (ROWS + 1) * CELL_SIZE;

        // Smoother colors with gradients and better contrast
        const BOARD_COLOR = '#1E3A8A';  // Deeper blue
        const P1_COLOR = '#DC2626';     // Rich red
        const P2_COLOR = '#FCD34D';     // Warm yellow

        const grid = Array(ROWS).fill(null).map(() => Array(COLS).fill(0));

        const boardPath =
            `M0,${CELL_SIZE} V${HEIGHT} H${WIDTH} V${CELL_SIZE} H0z` +
            grid.map((row, r) =>
                row.map((_, c) =>
                    `M${c * CELL_SIZE + CELL_SIZE / 2},${(r + 1) * CELL_SIZE + CELL_SIZE / 2}` +
                    ` m${-RADIUS},0 a${RADIUS},${RADIUS} 0 1,0 ${2 * RADIUS},0 a${RADIUS},${RADIUS} 0 1,0 ${-2 * RADIUS},0`
                ).join(' ')
            ).join(' ');

        // Slower animation with more frames
        const ANIMATION_FRAMES = 40;
        const FRAME_RATE = 20;  // Slower frame rate
        const PAUSE_FRAMES = 30; // Additional frames at the end for pause

        const middleCol = Math.floor(COLS / 2);
        const finalRow = ROWS - 1;

        const startY = CELL_SIZE / 2;
        const endY = (finalRow + 1) * CELL_SIZE + CELL_SIZE / 2;
        const cx = middleCol * CELL_SIZE + CELL_SIZE / 2;

        const framePromises = [];
        
        // Falling animation frames
        for (let i = 0; i < ANIMATION_FRAMES; i++) {
            const t = i / (ANIMATION_FRAMES - 1);
            // Use a bouncy easing function
            const easedT = t < 0.8 ? t * t * t : 1 - Math.pow(1 - t, 3);
            const currentY = startY + (endY - startY) * easedT;

            const fallingPieceSVG = `
                <circle cx="${cx}" cy="${currentY}" r="${RADIUS}" fill="url(#player1Gradient)" stroke="#B91C1C" stroke-width="3"/>
            `;

            const svgFrame = `
                <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <radialGradient id="player1Gradient" cx="30%" cy="30%">
                            <stop offset="0%" stop-color="#FCA5A5"/>
                            <stop offset="100%" stop-color="${P1_COLOR}"/>
                        </radialGradient>
                        <radialGradient id="player2Gradient" cx="30%" cy="30%">
                            <stop offset="0%" stop-color="#FEF3C7"/>
                            <stop offset="100%" stop-color="${P2_COLOR}"/>
                        </radialGradient>
                        <linearGradient id="boardGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#3B82F6"/>
                            <stop offset="100%" stop-color="${BOARD_COLOR}"/>
                        </linearGradient>
                    </defs>
                    <rect width="100%" height="100%" fill="transparent" />
                    <path fill="url(#boardGradient)" fill-rule="evenodd" d="${boardPath}" stroke="#1E40AF" stroke-width="4"/>
                    ${fallingPieceSVG}
                </svg>
            `;

            const framePath = path.join(tempDir, `frame-${String(i).padStart(3, '0')}.png`);
            framePromises.push(
                sharp(Buffer.from(svgFrame))
                    .png({ quality: 100, compressionLevel: 0 })
                    .toFile(framePath)
            );
        }

        // Pause frames with piece at bottom
        for (let i = 0; i < PAUSE_FRAMES; i++) {
            const frameIndex = ANIMATION_FRAMES + i;
            const pieceSVG = `
                <circle cx="${cx}" cy="${endY}" r="${RADIUS}" fill="url(#player1Gradient)" stroke="#B91C1C" stroke-width="3"/>
            `;

            const svgFrame = `
                <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <radialGradient id="player1Gradient" cx="30%" cy="30%">
                            <stop offset="0%" stop-color="#FCA5A5"/>
                            <stop offset="100%" stop-color="${P1_COLOR}"/>
                        </radialGradient>
                        <radialGradient id="player2Gradient" cx="30%" cy="30%">
                            <stop offset="0%" stop-color="#FEF3C7"/>
                            <stop offset="100%" stop-color="${P2_COLOR}"/>
                        </radialGradient>
                        <linearGradient id="boardGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#3B82F6"/>
                            <stop offset="100%" stop-color="${BOARD_COLOR}"/>
                        </linearGradient>
                    </defs>
                    <rect width="100%" height="100%" fill="transparent" />
                    <path fill="url(#boardGradient)" fill-rule="evenodd" d="${boardPath}" stroke="#1E40AF" stroke-width="4"/>
                    ${pieceSVG}
                </svg>
            `;

            const framePath = path.join(tempDir, `frame-${String(frameIndex).padStart(3, '0')}.png`);
            framePromises.push(
                sharp(Buffer.from(svgFrame))
                    .png({ quality: 100, compressionLevel: 0 })
                    .toFile(framePath)
            );
        }

        await Promise.all(framePromises);

        const outputGifPath = path.join(tempDir, 'connect4.gif');
        const ffmpegCommand = `ffmpeg -framerate ${FRAME_RATE} -i ${path.join(tempDir, 'frame-%03d.png')} -vf "scale=-1:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:reserve_transparent=0[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" -loop 0 ${outputGifPath}`;
        await execAsync(ffmpegCommand);

        return outputGifPath;
    }

    private async showGameBoard(interaction: CommandInteraction, game: Connect4Game, Bot: Client): Promise<void> {
        const staticBoardPath = await this.generateStaticBoard(game);
        const attachment = new AttachmentBuilder(staticBoardPath, { name: 'connect4-board.png' });

        const buttons = this.createGameButtons(game);
        const embed = this.createGameEmbed(game);

        await interaction.editReply({
            embeds: [embed],
            files: [attachment],
            components: buttons
        });

        // Set up move collector
        this.setupMoveCollector(interaction, game, Bot);

        // Handle bot move if bot goes first
        if (game.isPlayer2Bot && game.currentPlayer === 2) {
            // console.log(`🤖 Bot should move first! Triggering bot move...`);
            await this.handleBotMove(interaction, game, Bot);
        } else {
            // console.log(`👤 Human goes first (currentPlayer: ${game.currentPlayer}, isPlayer2Bot: ${game.isPlayer2Bot})`);
        }
    }

    private async generateStaticBoard(game: Connect4Game): Promise<string> {
        // Reduced resolution for better performance
        const ROWS = 6;
        const COLS = 7;
        const CELL_SIZE = 100; // Reduced from 200 to 100 for faster generation
        const RADIUS = CELL_SIZE / 2 - 10; // Adjusted radius proportionally
        
        // Offset for labels (only left and bottom) - adjusted for smaller size
        const BOARD_OFFSET_X = 45;  // Reduced proportionally
        const BOARD_OFFSET_Y = 20;  // Reduced proportionally
        
        // Calculate canvas dimensions to accommodate offsets and board
        const BOARD_WIDTH = COLS * CELL_SIZE;
        const BOARD_HEIGHT = (ROWS + 1) * CELL_SIZE;
        const WIDTH = BOARD_OFFSET_X + BOARD_WIDTH + 25; // Reduced padding
        const HEIGHT = Math.max(BOARD_HEIGHT + Math.abs(BOARD_OFFSET_Y) + 50, BOARD_HEIGHT + 75); // Reduced padding

        // Colors
        const BOARD_COLOR = '#7C3AED';  // Purple
        const P1_COLOR = '#DC2626';     // Rich red
        const P2_COLOR = '#FCD34D';     // Warm yellow
        const LABEL_COLOR = '#22C55E';  // Green for labels

        const boardPath =
            `M${BOARD_OFFSET_X},${CELL_SIZE + BOARD_OFFSET_Y} V${BOARD_OFFSET_Y + BOARD_HEIGHT} H${BOARD_OFFSET_X + BOARD_WIDTH} V${CELL_SIZE + BOARD_OFFSET_Y} H${BOARD_OFFSET_X}z` +
            game.grid.map((row, r) =>
                row.map((_, c) =>
                    `M${c * CELL_SIZE + CELL_SIZE / 2 + BOARD_OFFSET_X},${(r + 1) * CELL_SIZE + CELL_SIZE / 2 + BOARD_OFFSET_Y}` +
                    ` m${-RADIUS},0 a${RADIUS},${RADIUS} 0 1,0 ${2 * RADIUS},0 a${RADIUS},${RADIUS} 0 1,0 ${-2 * RADIUS},0`
                ).join(' ')
            ).join(' ');

        // Generate pieces with gradients
        let piecesHTML = '';
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (game.grid[r][c] !== CellState.EMPTY) {
                    const cx = c * CELL_SIZE + CELL_SIZE / 2 + BOARD_OFFSET_X;
                    const cy = (r + 1) * CELL_SIZE + CELL_SIZE / 2 + BOARD_OFFSET_Y;
                    const isPlayer1 = game.grid[r][c] === CellState.PLAYER1;
                    const gradientId = isPlayer1 ? 'player1Gradient' : 'player2Gradient';
                    const strokeColor = isPlayer1 ? '#B91C1C' : '#D97706';
                    piecesHTML += `<circle cx="${cx}" cy="${cy}" r="${RADIUS}" fill="url(#${gradientId})" stroke="${strokeColor}" stroke-width="2"/>`;
                }
            }
        }

        // Generate column labels (A-G like chess) - only bottom
        let columnLabelsHTML = '';
        const columnLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        for (let c = 0; c < COLS; c++) {
            const x = c * CELL_SIZE + CELL_SIZE / 2 + BOARD_OFFSET_X;
            // Only bottom labels - reduced font size for smaller board
            columnLabelsHTML += `<text x="${x}" y="${HEIGHT - 15}" text-anchor="middle" font-family="Lato, Arial, sans-serif" font-size="30" font-weight="bold" fill="${LABEL_COLOR}">${columnLabels[c]}</text>`;
        }

        // Generate row labels (1-6 like chess, with 6 at bottom) - only left
        let rowLabelsHTML = '';
        for (let r = 0; r < ROWS; r++) {
            const y = (r + 1) * CELL_SIZE + CELL_SIZE / 2 + BOARD_OFFSET_Y + 8; // Adjusted for smaller text
            const rowNumber = 6 - r; // Invert so 6 is at bottom like chess
            // Only left labels - reduced font size
            rowLabelsHTML += `<text x="20" y="${y}" text-anchor="middle" font-family="Lato, Arial, sans-serif" font-size="30" font-weight="bold" fill="${LABEL_COLOR}">${rowNumber}</text>`;
        }

        const svg = `
            <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <radialGradient id="player1Gradient" cx="30%" cy="30%">
                        <stop offset="0%" stop-color="#FCA5A5"/>
                        <stop offset="100%" stop-color="${P1_COLOR}"/>
                    </radialGradient>
                    <radialGradient id="player2Gradient" cx="30%" cy="30%">
                        <stop offset="0%" stop-color="#FEF3C7"/>
                        <stop offset="100%" stop-color="${P2_COLOR}"/>
                    </radialGradient>
                    <linearGradient id="boardGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#C084FC"/>
                        <stop offset="25%" stop-color="#A855F7"/>
                        <stop offset="50%" stop-color="#9333EA"/>
                        <stop offset="75%" stop-color="${BOARD_COLOR}"/>
                        <stop offset="100%" stop-color="#6B21A8"/>
                    </linearGradient>
                </defs>
                <rect width="100%" height="100%" fill="transparent" />
                <path fill="url(#boardGradient)" fill-rule="evenodd" d="${boardPath}" stroke="#7C3AED" stroke-width="2"/>
                ${piecesHTML}
                ${columnLabelsHTML}
                ${rowLabelsHTML}
            </svg>
        `;

        const tempDir = path.join(process.cwd(), 'temp', `c4-${game.gameId}`);
        const outputPath = path.join(tempDir, 'board.png');
        await sharp(Buffer.from(svg))
            .png({ quality: 80, compressionLevel: 6 }) // Reduced quality for faster processing
            .toFile(outputPath);
        
        return outputPath;
    }

    private createGameButtons(game: Connect4Game): ActionRowBuilder<ButtonBuilder>[] {
        const validMoves = game.getValidMoves();
        const buttons: ButtonBuilder[] = [];

        // Use chess-style column labels (A-G)
        const columnLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        
        for (let col = 0; col < 7; col++) {
            const button = new ButtonBuilder()
                .setCustomId(`move_${game.gameId}_${col}`)
                .setLabel(`${columnLabels[col]}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!validMoves.includes(col) || game.status !== GameStatus.PLAYING);

            buttons.push(button);
        }

        const resignButton = new ButtonBuilder()
            .setCustomId(`resign_${game.gameId}`)
            .setLabel('Resign')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(game.status !== GameStatus.PLAYING);

        buttons.push(resignButton);

        // Split into rows of max 5 buttons each
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        for (let i = 0; i < buttons.length; i += 5) {
            const row = new ActionRowBuilder<ButtonBuilder>();
            row.addComponents(...buttons.slice(i, i + 5));
            rows.push(row);
        }

        return rows;
    }

    private createGameEmbed(game: Connect4Game): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setTitle('Connect 4')
            .setColor('Blue');

        if (game.status === GameStatus.PLAYING) {
            const currentPlayer = game.getCurrentPlayer();
            const playerSymbol = game.currentPlayer === 1 ? '🔴' : '🟡';
            const player1Name = game.player1.username;
            const player2Name = game.isPlayer2Bot ? `${game.player2!.username} 🤖` : game.player2!.username;
            
            embed.setDescription(
                `**${player1Name}** 🔴 vs **${player2Name}** 🟡\n\n` +
                `${playerSymbol} **${currentPlayer.username}${currentPlayer.bot ? ' 🤖' : ''}**'s turn\n` +
                `Choose a column (A-G) to drop your piece!`
            );
        } else if (game.status === GameStatus.FINISHED) {
            if (game.winner) {
                const winnerSymbol = game.winner.id === game.player1.id ? '🔴' : '🟡';
                const player1Name = game.player1.username;
                const player2Name = game.isPlayer2Bot ? `${game.player2!.username} 🤖` : game.player2!.username;
                const winnerName = game.winner.bot ? `${game.winner.username} 🤖` : game.winner.username;
                
                embed.setDescription(
                    `**${player1Name}** 🔴 vs **${player2Name}** 🟡\n\n` +
                    `${winnerSymbol} **${winnerName}** wins! 🎉`
                );
                embed.setColor('Gold');
            } else {
                const player1Name = game.player1.username;
                const player2Name = game.isPlayer2Bot ? `${game.player2!.username} 🤖` : game.player2!.username;
                
                embed.setDescription(
                    `**${player1Name}** 🔴 vs **${player2Name}** 🟡\n\n` +
                    `It's a draw! 🤝`
                );
                embed.setColor('Grey');
            }
        }

        return embed;
    }

    private setupMoveCollector(interaction: CommandInteraction, game: Connect4Game, Bot: Client): void {
        const collector = interaction.channel?.createMessageComponentCollector({
            filter: (i) => i.customId.startsWith(`move_${game.gameId}`) || i.customId.startsWith(`resign_${game.gameId}`),
            time: 600000 // 10 minutes
        });

        collector?.on('collect', async (i: MessageComponentInteraction) => {
            if (game.status !== GameStatus.PLAYING) {
                await i.reply({ content: "This game has ended!", ephemeral: true });
                return;
            }

            const currentPlayer = game.getCurrentPlayer();
            
            // Block interactions when it's bot's turn
            if (game.isPlayer2Bot && currentPlayer.bot) {
                await i.reply({ content: "Please wait for the bot to make its move!", ephemeral: true });
                return;
            }
            
            // Check if it's the human player's turn
            if (i.user.id !== currentPlayer.id) {
                await i.reply({ content: "It's not your turn!", ephemeral: true });
                return;
            }

            if (i.customId.startsWith('resign_')) {
                // Don't try to defer/reply if the interaction is too old
                const interactionAge = Date.now() - i.createdTimestamp;
                const MAX_INTERACTION_AGE = 14 * 60 * 1000; // 14 minutes (leave 1 minute buffer)
                
                if (interactionAge < MAX_INTERACTION_AGE) {
                    try {
                        if (!i.replied && !i.deferred) {
                            await i.deferUpdate();
                        }
                    } catch (error) {
                        console.error("Error deferring resignation interaction:", error);
                        // Don't try to respond further if defer fails
                    }
                } else {
                    console.log("Interaction too old, skipping defer/reply");
                }
                
                game.status = GameStatus.FINISHED;
                game.winner = game.currentPlayer === 1 ? game.player2! : game.player1;
                
                // Update ratings for resignation
                const winnerID = game.winner.bot ? 
                    gameBotStrategies.get(game.gameId)?.getName() || "Bot" : 
                    game.winner.id;
                const loserID = game.currentPlayer === 1 ? game.player1.id : 
                    (game.isPlayer2Bot ? gameBotStrategies.get(game.gameId)?.getName() || "Bot" : game.player2!.id);
                
                await this.updateEloRatings(winnerID, loserID, interaction, Bot);
                
                await this.updateGameDisplay(interaction, game);
                collector.stop();
                return;
            }

            // Handle move
            const column = parseInt(i.customId.split('_')[2]);
            const moveResult = game.makeMove(column);

            if (!moveResult.success) {
                await i.reply({ content: "Invalid move! That column is full.", ephemeral: true });
                return;
            }

            // Check interaction age before trying to defer
            const interactionAge = Date.now() - i.createdTimestamp;
            const MAX_INTERACTION_AGE = 14 * 60 * 1000; // 14 minutes
            
            if (interactionAge < MAX_INTERACTION_AGE) {
                try {
                    if (!i.replied && !i.deferred) {
                        await i.deferUpdate();
                    }
                } catch (error) {
                    console.error("Error deferring move interaction:", error);
                    // Continue with game logic even if we can't defer
                }
            } else {
                console.log("Move interaction too old, skipping defer");
            }

            // Animation commented out for testing core functionality
            // await this.showMoveAnimation(interaction, game, column, moveResult.row!);

            // Animation wait commented out
            // await new Promise(resolve => setTimeout(resolve, 2000));

            // Update display immediately
            await this.updateGameDisplay(interaction, game);

            // Check if game ended after the move (status can change during makeMove)
            if (game.status !== GameStatus.PLAYING) {
                // Game ended, update ratings
                if (game.winner) {
                    const winnerID = game.winner.bot ? 
                        gameBotStrategies.get(game.gameId)?.getName() || "Bot" : 
                        game.winner.id;
                    const loserID = game.winner.id === game.player1.id ? 
                        (game.isPlayer2Bot ? gameBotStrategies.get(game.gameId)?.getName() || "Bot" : game.player2!.id) :
                        game.player1.id;
                    
                    await this.updateEloRatings(winnerID, loserID, interaction, Bot);
                }
                collector.stop();
                return;
            }

            // Handle bot move if it's bot's turn
            if (game.isPlayer2Bot && game.currentPlayer === 2) {
                await this.handleBotMove(interaction, game, Bot);
                
                // Check again if game ended after bot move
                if (game.status !== GameStatus.PLAYING) {
                    // Game ended after bot move, update ratings
                    if (game.winner) {
                        const winnerID = game.winner.bot ? 
                            gameBotStrategies.get(game.gameId)?.getName() || "Bot" : 
                            game.winner.id;
                        const loserID = game.winner.id === game.player1.id ? 
                            (game.isPlayer2Bot ? gameBotStrategies.get(game.gameId)?.getName() || "Bot" : game.player2!.id) :
                            game.player1.id;
                        
                        await this.updateEloRatings(winnerID, loserID, interaction, Bot);
                    }
                    collector.stop();
                }
            }
        });

        collector?.on('end', () => {
            activeGames.delete(game.gameId);
            gameBotStrategies.delete(game.gameId);
        });
    }

    private async showMoveAnimation(interaction: CommandInteraction, game: Connect4Game, column: number, row: number): Promise<void> {
        const tempDir = path.join(process.cwd(), 'temp', `c4-${game.gameId}`);
        
        try {
            const animationGifPath = await this.generateMoveAnimation(tempDir, game, column, row);
            const attachment = new AttachmentBuilder(animationGifPath, { name: 'move-animation.gif' });

            const embed = this.createGameEmbed(game);
            
            await interaction.editReply({
                embeds: [embed],
                files: [attachment],
                components: []
            });

        } catch (error) {
            console.error("Error generating move animation:", error);
        }
    }

    private async generateMoveAnimation(tempDir: string, game: Connect4Game, dropColumn: number, finalRow: number): Promise<string> {
        // Similar to generateFallingAnimation but with current board state and specific move
        // Higher resolution settings (same as other methods)
        const ROWS = 6;
        const COLS = 7;
        const CELL_SIZE = 200;  // Doubled for higher resolution
        const RADIUS = CELL_SIZE / 2 - 20;  // Adjusted radius
        const WIDTH = COLS * CELL_SIZE;
        const HEIGHT = (ROWS + 1) * CELL_SIZE;

        // Same improved colors
        const BOARD_COLOR = '#1E3A8A';  // Deeper blue
        const P1_COLOR = '#DC2626';     // Rich red
        const P2_COLOR = '#FCD34D';     // Warm yellow

        const boardPath =
            `M0,${CELL_SIZE} V${HEIGHT} H${WIDTH} V${CELL_SIZE} H0z` +
            game.grid.map((row, r) =>
                row.map((_, c) =>
                    `M${c * CELL_SIZE + CELL_SIZE / 2},${(r + 1) * CELL_SIZE + CELL_SIZE / 2}` +
                    ` m${-RADIUS},0 a${RADIUS},${RADIUS} 0 1,0 ${2 * RADIUS},0 a${RADIUS},${RADIUS} 0 1,0 ${-2 * RADIUS},0`
                ).join(' ')
            ).join(' ');

        // Generate existing pieces with gradients (except the one that just moved)
        let existingPiecesHTML = '';
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (game.grid[r][c] !== CellState.EMPTY && !(r === finalRow && c === dropColumn)) {
                    const cx = c * CELL_SIZE + CELL_SIZE / 2;
                    const cy = (r + 1) * CELL_SIZE + CELL_SIZE / 2;
                    const isPlayer1 = game.grid[r][c] === CellState.PLAYER1;
                    const gradientId = isPlayer1 ? 'player1Gradient' : 'player2Gradient';
                    const strokeColor = isPlayer1 ? '#B91C1C' : '#D97706';
                    existingPiecesHTML += `<circle cx="${cx}" cy="${cy}" r="${RADIUS}" fill="url(#${gradientId})" stroke="${strokeColor}" stroke-width="3"/>`;
                }
            }
        }

        // Enhanced animation settings
        const ANIMATION_FRAMES = 30;
        const FRAME_RATE = 20;
        const PAUSE_FRAMES = 20;

        const startY = CELL_SIZE / 2;
        const endY = (finalRow + 1) * CELL_SIZE + CELL_SIZE / 2;
        const cx = dropColumn * CELL_SIZE + CELL_SIZE / 2;
        const isPlayer1 = game.grid[finalRow][dropColumn] === CellState.PLAYER1;
        const gradientId = isPlayer1 ? 'player1Gradient' : 'player2Gradient';
        const strokeColor = isPlayer1 ? '#B91C1C' : '#D97706';

        const framePromises = [];
        
        // Falling animation with improved easing
        for (let i = 0; i < ANIMATION_FRAMES; i++) {
            const t = i / (ANIMATION_FRAMES - 1);
            // Use bouncy easing for more realistic physics
            const easedT = t < 0.8 ? t * t * t : 1 - Math.pow(1 - t, 3);
            const currentY = startY + (endY - startY) * easedT;

            const fallingPieceSVG = `<circle cx="${cx}" cy="${currentY}" r="${RADIUS}" fill="url(#${gradientId})" stroke="${strokeColor}" stroke-width="3"/>`;

            const svgFrame = `
                <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <radialGradient id="player1Gradient" cx="30%" cy="30%">
                            <stop offset="0%" stop-color="#FCA5A5"/>
                            <stop offset="100%" stop-color="${P1_COLOR}"/>
                        </radialGradient>
                        <radialGradient id="player2Gradient" cx="30%" cy="30%">
                            <stop offset="0%" stop-color="#FEF3C7"/>
                            <stop offset="100%" stop-color="${P2_COLOR}"/>
                        </radialGradient>
                        <linearGradient id="boardGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#3B82F6"/>
                            <stop offset="100%" stop-color="${BOARD_COLOR}"/>
                        </linearGradient>
                    </defs>
                    <rect width="100%" height="100%" fill="transparent" />
                    <path fill="url(#boardGradient)" fill-rule="evenodd" d="${boardPath}" stroke="#1E40AF" stroke-width="4"/>
                    ${existingPiecesHTML}
                    ${fallingPieceSVG}
                </svg>
            `;

            const framePath = path.join(tempDir, `move-frame-${String(i).padStart(3, '0')}.png`);
            framePromises.push(
                sharp(Buffer.from(svgFrame))
                    .png({ quality: 100, compressionLevel: 0 })
                    .toFile(framePath)
            );
        }

        // Pause frames with enhanced visuals
        for (let i = 0; i < PAUSE_FRAMES; i++) {
            const frameIndex = ANIMATION_FRAMES + i;
            const finalPieceSVG = `<circle cx="${cx}" cy="${endY}" r="${RADIUS}" fill="url(#${gradientId})" stroke="${strokeColor}" stroke-width="3"/>`;

            const svgFrame = `
                <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <radialGradient id="player1Gradient" cx="30%" cy="30%">
                            <stop offset="0%" stop-color="#FCA5A5"/>
                            <stop offset="100%" stop-color="${P1_COLOR}"/>
                        </radialGradient>
                        <radialGradient id="player2Gradient" cx="30%" cy="30%">
                            <stop offset="0%" stop-color="#FEF3C7"/>
                            <stop offset="100%" stop-color="${P2_COLOR}"/>
                        </radialGradient>
                        <linearGradient id="boardGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#3B82F6"/>
                            <stop offset="100%" stop-color="${BOARD_COLOR}"/>
                        </linearGradient>
                    </defs>
                    <rect width="100%" height="100%" fill="transparent" />
                    <path fill="url(#boardGradient)" fill-rule="evenodd" d="${boardPath}" stroke="#1E40AF" stroke-width="4"/>
                    ${existingPiecesHTML}
                    ${finalPieceSVG}
                </svg>
            `;

            const framePath = path.join(tempDir, `move-frame-${String(frameIndex).padStart(3, '0')}.png`);
            framePromises.push(
                sharp(Buffer.from(svgFrame))
                    .png({ quality: 100, compressionLevel: 0 })
                    .toFile(framePath)
            );
        }

        await Promise.all(framePromises);

        const outputGifPath = path.join(tempDir, 'move-animation.gif');
        const ffmpegCommand = `ffmpeg -framerate ${FRAME_RATE} -i ${path.join(tempDir, 'move-frame-%03d.png')} -vf "scale=-1:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:reserve_transparent=0[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" -loop 0 ${outputGifPath}`;
        await execAsync(ffmpegCommand);

        return outputGifPath;
    }

    private async updateGameDisplay(interaction: CommandInteraction, game: Connect4Game): Promise<void> {
        const staticBoardPath = await this.generateStaticBoard(game);
        const attachment = new AttachmentBuilder(staticBoardPath, { name: 'connect4-board.png' });
        
        const buttons = this.createGameButtons(game);
        const embed = this.createGameEmbed(game);

        await interaction.editReply({
            embeds: [embed],
            files: [attachment],
            components: game.status === GameStatus.FINISHED ? [] : buttons
        });

        // Clean up temp files after game ends
        if (game.status === GameStatus.FINISHED) {
            setTimeout(async () => {
                try {
                    const tempDir = path.join(process.cwd(), 'temp', `c4-${game.gameId}`);
                    await fs.rm(tempDir, { recursive: true, force: true });
                } catch (error) {
                    console.error("Error cleaning up temp files:", error);
                }
            }, 10000); // Clean up after 10 seconds
        }
    }

    private async handleBotMove(interaction: CommandInteraction, game: Connect4Game, Bot: Client): Promise<void> {
        const botStrategy = gameBotStrategies.get(game.gameId);
        if (!botStrategy) {
            console.error("Bot strategy not found for game:", game.gameId);
            return;
        }

        try {
            // console.log(`🤖 Bot ${game.player2?.username} is thinking...`);
            
            // Convert game board to format expected by bot strategy
            const board = game.grid.map(row => [...row]);
            const validColumns = game.getValidMoves();
            
            // console.log(`🤖 Valid columns: ${validColumns}, Current player: ${game.currentPlayer}`);
            
            // Get bot's move with a minimal delay for realism
            await new Promise(resolve => setTimeout(resolve, 200));
            const botColumn = await botStrategy.makeMove(board, validColumns);
            
            // console.log(`🤖 Bot chose column: ${botColumn}`);
            
            // Make the bot's move
            const moveResult = game.makeMove(botColumn);
            
            if (moveResult.success) {
                // console.log(`🤖 Bot move successful! Row: ${moveResult.row}, Column: ${botColumn}`);
                
                // Animation commented out for testing core functionality
                // await this.showMoveAnimation(interaction, game, botColumn, moveResult.row!);
                
                // Animation wait commented out
                // await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Update display immediately
                await this.updateGameDisplay(interaction, game);
            } else {
                console.error("🤖 Bot move failed!");
            }
        } catch (error) {
            console.error("Error handling bot move:", error);
        }
    }

    // Rating system methods ported from Nim
    async update(userWID: string, userID: string){
        var ranking = new glicko2.Glicko2();
        let p1s = [await db.get(`${userWID}.pointsNIM`),await db.get(`${userWID}.rdNIM`),await db.get(`${userWID}.volNIM`)];
        let p2s = [await db.get(`${userID}.pointsNIM`),await db.get(`${userID}.rdNIM`),await db.get(`${userID}.volNIM`)];

        var p1 = ranking.makePlayer(p1s[0],p1s[1],p1s[2]);
        var p2 = ranking.makePlayer(p2s[0],p2s[1],p2s[2]);
        ranking.updateRatings([[p1,p2,1]]);

        await db.set(`${userWID}.pointsNIM`,p1.getRating());
        await db.set(`${userWID}.rdNIM`,p1.getRd());
        await db.set(`${userWID}.volNIM`,p1.getVol());
        await db.set(`${userID}.pointsNIM`,p2.getRating());
        await db.set(`${userID}.rdNIM`,p2.getRd());
        await db.set(`${userID}.volNIM`,p2.getVol());

        history.push(`${userWID}.CONNECT4`,p1.getRating());
        history.push(`${userID}.CONNECT4`,p2.getRating());
    }

    // Elo rating update
    private async updateEloRatings(
        winner: string,
        loser: string,
        interaction: CommandInteraction,
        Bot: Client
    ) {
        let arr: [string, number, number][] = [
            [winner, (await db.get(`${winner}.pointsNIM`))!, 0],
            [loser, (await db.get(`${loser}.pointsNIM`))!, 0]];
        await this.update(winner,loser);
        arr[0][2] = (await db.get(`${winner}.pointsNIM`))!;
        arr[1][2] = (await db.get(`${loser}.pointsNIM`))!;
        this.returnLB(interaction, arr);
    }

    private async returnLB(msg: CommandInteraction, leaderboardData: [string, number, number][]){
        // Create and send the embed without pagination to avoid interaction conflicts
        const embed = this.createLeaderboardEmbed(leaderboardData, 0, msg); // Start at page 0
        
        let channel = msg.channel as TextChannel;
        try {
            await channel!.send({ embeds: [embed] }); // No components to avoid interaction conflicts
        } catch (error) {
            console.error("Error sending leaderboard:", error);
        }
    }

    private createPaginationButtons(currentPage: number): ActionRowBuilder {
        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`previous_${currentPage}`)  // Embedding the current page number
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === 0),  // Disable if it's the first page
                new ButtonBuilder()
                    .setCustomId(`next_${currentPage}`)  // Embedding the current page number
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary),
            );

        return buttons;
    }

    private isNumber(value?: string | number): boolean {
       return ((value != null) &&
               (value !== '') &&
               !isNaN(Number(value.toString())));
    }

    private createLeaderboardEmbed(userArray: [string, number, number][], page: number, msg: CommandInteraction): EmbedBuilder {
        const begint = page * 10;
        const endt = Math.min(userArray.length - 1, begint + 9);
        const embed = new EmbedBuilder()
            .setTitle('Connect4 ELO Leaderboard')
            .setColor('Aqua')
            .setDescription('💀 Here are the top ppl who have the highest Ratings!? 💀')
            .setAuthor({name: msg.user!.username, iconURL: msg.user!.avatarURL()!})
            .setTimestamp()
            .setThumbnail('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSD40R2DKe8m_WuhxZE-MH-n_A4cohVkR4H3nvLD-csGw&s');

        for (var i = begint; i <= endt; ++i) {
            let username: any = userArray[i][0];
            var title = "";
            if (this.isNumber(userArray[i][0]))
                username = msg.client.users.cache.find(user => user.id === userArray[i][0])?.username;
            else
                title = "**BOT**";
            let rounded,rounded2;
            let stable = "";
            if (isNaN(userArray[i][1])) {
                console.log(username, userArray[i]);
            }
            else {
                rounded = Number(Math.round(userArray[i][1]));
                rounded2 = Number(Math.round(userArray[i][2]));
            }
            
            let initializer = "";

            if (i == 0)
                initializer = `<:first_place:822885876144275499>`;
            else if (i == 1)
                initializer = `<:second_place:822887005679648778>`;
            else if (i == 2)
                initializer = `<:third_place:822887031143137321>`;

            var value: any = userArray[i][1];
            if (userArray[i][2] > 150)
                stable="?";
            
            if (isNaN(value))
                value = "N/A"
            else if (stable=="" && title == "")
                title = Titles.getAbbrev(value);
            
            let congoMsg = "";
            if (rounded2 && rounded2 >= 2000 && stable=="" && title!="**BOT**"){
                congoMsg = " 🎉";
            }

            let cnt = "";

            if (userArray[i][0] == msg.user.id)
                embed.addFields(
                    { name: `${initializer} **#${(i + 1)}: ${title} ${username}** (You)`, value: `**${rounded}** → **${rounded2}**${congoMsg}` },)
            else
                embed.addFields(
                    { name: `${initializer} #${(i + 1)}: ${title} ${username}${cnt}`, value: `**${rounded}** → **${rounded2}**${congoMsg}` },)
        }

        return embed;
    }
}
