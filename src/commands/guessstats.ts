import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { QuickDB } from "quick.db";

const db = new QuickDB();
const statsTable = db.table('guess_stats');

export default class guessstats implements IBotInteraction {
    name(): string {
        return "guessstats";
    }

    help(): string {
        return "View your Chris vs Layla guessing game statistics";
    }

    cooldown(): number {
        return 5;
    }

    isThisInteraction(command: string): boolean {
        return command === "guessstats";
    }

    data(): any {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help())
            .addUserOption(option => 
                option.setName('user')
                    .setDescription('User to check stats for (defaults to you)')
                    .setRequired(false)
            );
    }

    perms(): "admin" | "user" | "both" {
        return "both";
    }

    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        
        // Get the user's stats
        const stats = await statsTable.get(targetUser.id) || { total: 0, correct: 0 };
        const { total = 0, correct = 0 } = stats;
        
        // Calculate percentage with handling for division by zero
        const percentage = total > 0 ? ((correct / total) * 100).toFixed(1) : '0.0';
        
        const embed = new EmbedBuilder()
            .setAuthor({ 
                name: `${targetUser.username}'s Guess Statistics`, 
                iconURL: targetUser.displayAvatarURL() 
            })
            .setColor("#3498db")
            .addFields(
                { name: 'Total Guesses', value: total.toString(), inline: true },
                { name: 'Correct Guesses', value: correct.toString(), inline: true },
                { name: 'Accuracy', value: `${percentage}%`, inline: true }
            )
            .setFooter({ text: 'Snow vs Moni - Who wrote it?' })
            .setTimestamp();

        // Add a note to try the game if they haven't played yet
        if (total === 0) {
            embed.setDescription('Try playing the game with `/guess` to start building your stats!');
        }

        await interaction.reply({ embeds: [embed] });
    }
}
