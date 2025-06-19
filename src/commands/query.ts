import { SlashCommandBuilder, EmbedBuilder, Client, ButtonBuilder, ActionRowBuilder, ButtonStyle, ComponentType, ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { QuickDB } from "quick.db";
import { GuessGameConfig } from "../util/GuessGameConfig.js";
import * as fs from 'fs';
import { promisify } from 'util';
import * as path from 'path';

const readFileAsync = promisify(fs.readFile);
const db = new QuickDB();
const statsTable = db.table('random_guess_stats');

const { MIN_WORD_COUNT, GUESS_TIMEOUT, MAX_MESSAGE_LENGTH } = GuessGameConfig;

// Available users and their display names
const AVAILABLE_USERS = {
    'chris': 'Lintahlo',
    'deep': 'Deep',
    'fairylog': 'Fairylog',
    'layla': 'Layla',
    'moni': 'Amog Magnussen',
    'rbit': 'Rbit',
    'redstone': 'Redstone',
    'snow': 'Coriolanus Snow'
};

const USER_EMULATOR_PATH = "/Users/monke/Desktop/ELOBot/src/util/UserEmulator/user_messages";

export default class query implements IBotInteraction {
    name(): string {
        return "query";
    }

    help(): string {
        return "Guess between two randomly selected users who wrote a message.";
    }

    cooldown(): number {
        return 2;
    }

    isThisInteraction(command: string): boolean {
        return command === "query";
    }

    data(): any {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help());
    }

    perms(): "admin" | "user" | "both" {
        return "both";
    }

    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        await interaction.deferReply();
        
        try {
            // Get all available user keys
            const userKeys = Object.keys(AVAILABLE_USERS);
            
            // Randomly select two different users
            const shuffled = [...userKeys].sort(() => 0.5 - Math.random());
            const [user1Key, user2Key] = shuffled.slice(0, 2);
            
            const user1Name = AVAILABLE_USERS[user1Key as keyof typeof AVAILABLE_USERS];
            const user2Name = AVAILABLE_USERS[user2Key as keyof typeof AVAILABLE_USERS];
            
            // Construct file paths
            const user1FilePath = path.join(USER_EMULATOR_PATH, `${user1Key}.txt`);
            const user2FilePath = path.join(USER_EMULATOR_PATH, `${user2Key}.txt`);
            
            // Load messages from files
            const [user1Content, user2Content] = await Promise.all([
                readFileAsync(user1FilePath, 'utf8'),
                readFileAsync(user2FilePath, 'utf8')
            ]);
            
            // Split the content into messages (one per line)
            const user1Messages = user1Content.split('\n').filter(line => 
                line.trim().length > 0 && 
                !line.startsWith('//') &&
                line.split(/\s+/).filter(word => word.trim().length > 0).length >= MIN_WORD_COUNT
            );
            
            const user2Messages = user2Content.split('\n').filter(line => 
                line.trim().length > 0 && 
                !line.startsWith('//') &&
                line.split(/\s+/).filter(word => word.trim().length > 0).length >= MIN_WORD_COUNT
            );
            
            if (user1Messages.length === 0 || user2Messages.length === 0) {
                await interaction.editReply(`Couldn't load enough messages from both ${user1Name} and ${user2Name}.`);
                return;
            }

            console.log(`Loaded ${user1Messages.length} messages from ${user1Name} and ${user2Messages.length} messages from ${user2Name}`);
            
            // Select random author (user1 or user2)
            const isUser1 = Math.random() >= 0.5;
            const authorName = isUser1 ? user1Name : user2Name;
            const messages = isUser1 ? user1Messages : user2Messages;
            
            // Select a random message from the chosen author
            const randomIndex = Math.floor(Math.random() * messages.length);
            const randomMessage = messages[randomIndex];
            
            // Truncate message if it's too long
            let displayMessage = randomMessage.length > MAX_MESSAGE_LENGTH 
                ? randomMessage.substring(0, MAX_MESSAGE_LENGTH) + "..." 
                : randomMessage;
                
            // Make the first character of the first word lowercase if it's alphabetical
            displayMessage = displayMessage.replace(/^([A-Z])/, (match) => match.toLowerCase());

            // Get word count for the message
            const wordCount = randomMessage.split(/\s+/).filter(word => word.trim().length > 0).length;
            
            // Create embed with the message
            const embed = new EmbedBuilder()
                .setTitle(`Who wrote this message?`)
                .setDescription(displayMessage)
                .setColor("#9b59b6")
                .setFields([
                    { name: "Word Count", value: wordCount.toString(), inline: true }
                ])
                .setTimestamp()
                .setFooter({ text: `${user1Name} or ${user2Name}?` });

            // Create buttons for guessing
            const user1Button = new ButtonBuilder()
                .setCustomId('guess_user1')
                .setLabel(user1Name)
                .setStyle(ButtonStyle.Primary);

            const user2Button = new ButtonBuilder()
                .setCustomId('guess_user2')
                .setLabel(user2Name)
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(user1Button, user2Button);

            const response = await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

            // Collect button interactions
            const collector = response.createMessageComponentCollector({ 
                componentType: ComponentType.Button,
                time: GUESS_TIMEOUT 
            });

            collector.on('collect', async (i: ButtonInteraction) => {
                // Only the person who started the command can use the buttons
                if (i.user.id !== interaction.user.id) {
                    await i.reply({ content: "This isn't your game!", ephemeral: true });
                    return;
                }

                const guessedUser1 = i.customId === 'guess_user1';
                const isCorrect = (guessedUser1 && isUser1) || (!guessedUser1 && !isUser1);
                
                const resultEmbed = new EmbedBuilder()
                    .setTitle(isCorrect ? "✅ Correct!" : "❌ Wrong!")
                    .setDescription(`That message was written by **${authorName}**.\n\n"${displayMessage}"`)
                    .setColor(isCorrect ? "#2ecc71" : "#e74c3c")
                    .setFields([
                        { name: "Challenge", value: `${user1Name} vs ${user2Name}`, inline: true },
                        { name: "Word Count", value: wordCount.toString(), inline: true }
                    ])
                    .setTimestamp();

                await i.update({ 
                    embeds: [resultEmbed], 
                    components: [] 
                });

                // Update stats
                await statsTable.add(`${interaction.user.id}.total`, 1);
                if (isCorrect) {
                    await statsTable.add(`${interaction.user.id}.correct`, 1);
                }
            });

            collector.on('end', async (collected: any) => {
                if (collected.size === 0) {
                    const timeoutEmbed = new EmbedBuilder()
                        .setTitle("⏰ Time's up!")
                        .setDescription(`The message was written by **${authorName}**.\n\n"${displayMessage}"`)
                        .setColor("#f39c12")
                        .setFields([
                            { name: "Challenge", value: `${user1Name} vs ${user2Name}`, inline: true },
                            { name: "Word Count", value: wordCount.toString(), inline: true }
                        ])
                        .setTimestamp();
                        
                    await interaction.editReply({
                        embeds: [timeoutEmbed],
                        components: []
                    });
                }
            });
            
        } catch (error) {
            console.error("Error in randomguess command:", error);
            await interaction.editReply(`An error occurred while running the command: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
