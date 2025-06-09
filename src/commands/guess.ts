import { SlashCommandBuilder, EmbedBuilder, Client, ButtonBuilder, ActionRowBuilder, ButtonStyle, ComponentType, ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { QuickDB } from "quick.db";
import { GuessGameConfig } from "../util/GuessGameConfig.js";
import * as fs from 'fs';
import { promisify } from 'util';

const readFileAsync = promisify(fs.readFile);
const db = new QuickDB();
const statsTable = db.table('guess_stats');

const { CHRIS_FILE_PATH, LAYLA_FILE_PATH, USER_NAMES, MIN_WORD_COUNT, GUESS_TIMEOUT, MAX_MESSAGE_LENGTH } = GuessGameConfig;

export default class guess implements IBotInteraction {
    name(): string {
        return "guess";
    }

    help(): string {
        return "Guess whether Snow or Moni wrote a message.";
    }

    cooldown(): number {
        return 5;
    }

    isThisInteraction(command: string): boolean {
        return command === "guess";
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
            // Load messages from files
            const [chrisContent, laylaContent] = await Promise.all([
                readFileAsync(CHRIS_FILE_PATH, 'utf8'),
                readFileAsync(LAYLA_FILE_PATH, 'utf8')
            ]);
            
            // Split the content into messages (one per line)
            const chrisMessages = chrisContent.split('\n').filter(line => 
                line.trim().length > 0 && 
                !line.startsWith('//') &&
                line.split(/\s+/).filter(word => word.trim().length > 0).length >= MIN_WORD_COUNT
            );
            
            const laylaMessages = laylaContent.split('\n').filter(line => 
                line.trim().length > 0 && 
                !line.startsWith('//') &&
                line.split(/\s+/).filter(word => word.trim().length > 0).length >= MIN_WORD_COUNT
            );
            
            if (chrisMessages.length === 0 || laylaMessages.length === 0) {
                await interaction.editReply("Couldn't load enough messages from both Chris and Layla.");
                return;
            }

            console.log(`Loaded ${chrisMessages.length} messages from Snow and ${laylaMessages.length} messages from Moni`);
            
            // Select random author (Chris or Layla)
            const isChris = Math.random() >= 0.5;
            const authorName = isChris ? "Snow" : "Moni";
            const messages = isChris ? chrisMessages : laylaMessages;
            
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
                .setTitle("Who wrote this message?")
                .setDescription(displayMessage)
                .setColor("#3498db")
                .setFields([
                    { name: "Word Count", value: wordCount.toString(), inline: true }
                ])
                .setTimestamp()
                .setFooter({ text: "Snow or Moni?" });

            // Create buttons for guessing
            const chrisButton = new ButtonBuilder()
                .setCustomId('guess_chris')
                .setLabel('Snow')
                .setStyle(ButtonStyle.Primary);

            const laylaButton = new ButtonBuilder()
                .setCustomId('guess_layla')
                .setLabel('Moni')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(chrisButton, laylaButton);

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

                const guessedChris = i.customId === 'guess_chris';
                const isCorrect = (guessedChris && isChris) || (!guessedChris && !isChris);
                
                const resultEmbed = new EmbedBuilder()
                    .setTitle(isCorrect ? "✅ Correct!" : "❌ Wrong!")
                    .setDescription(`That message was written by ${authorName}.\n\n"${displayMessage}"`)
                    .setColor(isCorrect ? "#2ecc71" : "#e74c3c")
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
                    await interaction.editReply({
                        content: `Time's up! The message was written by ${authorName}.`,
                        components: []
                    });
                }
            });
            
        } catch (error) {
            console.error("Error in guess command:", error);
            await interaction.editReply(`An error occurred while running the command: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
