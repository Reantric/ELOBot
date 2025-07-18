import { ChatInputCommandInteraction, Client, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from "url";

export default class about implements IBotInteraction {
    name(): string {
        return "about";
    }

    help(): string {
        return "Display information about the bot and PGP public key.";
    }

    cooldown(): number {
        return 5;
    }

    isThisInteraction(command: string): boolean {
        return command === "about";
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
        try {
            // Read the PGP public key from temp/pkey.txt
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const keyPath = path.join(__dirname, '../../temp/pkey.txt');
            const pgpKey = fs.readFileSync(keyPath, 'utf-8');
            
            // Create a simple embed with just the PGP key
            const embed = new EmbedBuilder()
                .setDescription(`\`\`\`\n${pgpKey}\`\`\``)
                .setColor('#00D4AA');

            await interaction.reply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error reading PGP key:', error);
            
            // Fallback embed if file reading fails
            const errorEmbed = new EmbedBuilder()
                .setDescription('Unable to load PGP public key.')
                .setColor('#FF6B6B');

            await interaction.reply({ embeds: [errorEmbed] });
        }
    }
}