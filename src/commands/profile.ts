import { Client, Role, Interaction, CommandInteraction, User, RoleManager, GuildMemberRoleManager, ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { SlashCommandBuilder } from '@discordjs/builders';
import { QuickDB } from "quick.db";
const db = new QuickDB();
import Titles from "../util/Titles.js";

export default class profile implements IBotInteraction {

    name(): string {
        return "profile";
    } 

    help(): string {
        return "View your Rating, Rating Deviation, and Title";
    }   
    
    cooldown(): number{
        return 2;
    }
    isThisInteraction(command: string): boolean {
        return command === "profile";
    }

    data(): any {
        return new SlashCommandBuilder()
		.setName(this.name())
		.setDescription(this.help())
        .addUserOption((option:any) => option.setName('target').setDescription('Select a user'));
    }
    perms(): "admin" | "user" | "both" {
        return 'both';
    }

    private async formatProfileEmbed(user: User) {
        const valNIM = await db.get(`${user.id}.pointsNIM`);
        const rdNIM = await db.get(`${user.id}.rdNIM`);

        const valAOPS = await db.get(`${user.id}.pointsAOPS`);
        const rdAOPS = await db.get(`${user.id}.rdAOPS`);
        const embed = new EmbedBuilder();
        const NimTitle = Titles.getTitle(valNIM);
        const AOPSTitle = Titles.getTitle(valAOPS);
        embed.setTitle(`${user.username}'s Profile`)
        .setDescription(`Here is ${user.username}'s info!`)
        .setAuthor({name: user.username, iconURL: user.avatarURL()!})
        .setColor(NimTitle[1]) // (max of both titles?)
        .addFields({
            name: 'Nim Rating',
            value: `**${Math.floor(valNIM)}** ± ${Math.round(rdNIM)}`,
            inline: true
        })
        .addFields({
            name: 'AOPS Rating',
            value: `**${Math.floor(valAOPS)}** ± ${Math.round(rdAOPS)}`,
            inline: true
        })
        .addFields({
            name: 'Title',
            value: `**${NimTitle[0]}**`,
            inline: true
        })
        .setThumbnail(user.avatarURL()!)
        .setTimestamp(new Date())
        .setFooter({text: 'ME Profile'});
        return embed;
    }

    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        let user = interaction.options.getUser('target');
        if (!user) {
            user = interaction.user;
        }
        const embed = await this.formatProfileEmbed(user);
        await interaction.reply({ 
            content: `Here is ${user}'s profile`,
            embeds: [embed], 
            ephemeral: false 
        });  

        
    }
}
