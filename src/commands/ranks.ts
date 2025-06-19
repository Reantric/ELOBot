import { Client, Role, Interaction, CommandInteraction, User, RoleManager, GuildMemberRoleManager, Colors } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { SlashCommandBuilder } from '@discordjs/builders';
import { QuickDB } from "quick.db";
const db = new QuickDB();
import Titles from "../util/Titles.js";

export default class ranks implements IBotInteraction {

    name(): string {
        return "ranks";
    } 

    help(): string {
        return "View all Ranks/Titles";
    }   
    
    cooldown(): number{
        return 2;
    }
    isThisInteraction(command: string): boolean {
        return command === "ranks";
    }

    data(): any {
        return new SlashCommandBuilder()
		.setName(this.name())
		.setDescription(this.help())
    }
    perms(): "admin" | "user" | "both" {
        return 'both';
    }

    
    async runCommand(interaction: CommandInteraction, Bot: Client): Promise<void> {
        const embed = new EmbedBuilder();
        embed.setTitle(`All ELO Ranks and Colors`)
        .setColor(Colors.LuminousVividPink)
        .setDescription(`Below are all the ranks in the system, sorted from highest to lowest rating.`);
        
        // Create a compact table-like layout
        for (var i = Titles.Title.length-1; i >= 0; i--){
            const colorHex = Titles.Title[i][4] || '#FFFFFF';
            // Use Discord's color name or the hex code
            const colorDisplay = colorHex.startsWith('#') ? colorHex : Titles.Title[i][1].toString();
            
            // Use different colored emoji blocks based on rank level for better visual distinction
            const colorEmojis = ['⬜', '🟩', '🟦', '🟪', '🟫', '🟨', '🟧', '🟥', '⬛', '🔳', '🔲'];
            const coloredBlock = colorEmojis[Math.min(i, colorEmojis.length - 1)];
            
            let title = Titles.Title[i][3] ? `${Titles.Title[i][0]} (${Titles.Title[i][3]})` : Titles.Title[i][0];
            
            // Add visual bars based on rank importance - higher ranks get more bars
            // i is descending (highest rank is i=10, lowest rank is i=0)
            // Convert this to an ascending scale for bars (1-5)
            const rankLevel = i + 1; // Add 1 to avoid 0 bars for the lowest rank
            const bars = Math.min(Math.ceil(rankLevel / 2), 5); // Divide by 2 to map 1-11 to 1-5 range
            const ratingBar = "▰".repeat(bars) + "▱".repeat(5 - bars);
            
            embed.addFields({
                name: `${coloredBlock} ${title}`,
                value: `Rating: **${Titles.Title[i][2][0]}-${Titles.Title[i][2][1]}**\nRange: ${ratingBar}`,
                inline: false
            });
        }
        
        embed.setTimestamp(new Date())
        .setFooter({text: 'ELO Ranking System'});

        await interaction.reply({ 
            embeds: [embed], 
            ephemeral: false 
        });  
    }
}
