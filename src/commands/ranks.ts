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
        embed.setTitle(`All ranks!`)
        .setColor(Colors.LuminousVividPink); // add colors
        
        for (var i = Titles.Title.length; i >= 0; i--){
            embed.addFields({
                name: Titles.Title[i][0],
                value: `**[${Titles.Title[i][2][0]},${Titles.Title[i][2][1]}]**`,
                inline: false
            })
        }
        
       
        embed.setTimestamp(new Date())
        .setFooter({text: 'Ranker hu'});

        await interaction.reply({ 
            embeds: [embed], 
            ephemeral: false 
        });  

        
    }
}
