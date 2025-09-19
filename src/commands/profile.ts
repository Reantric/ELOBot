import { Client, ChatInputCommandInteraction, User } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { SlashCommandBuilder } from '@discordjs/builders';
import { QuickDB } from "quick.db";
import { markToMarket } from '../util/trading/portfolio.js';

const db = new QuickDB();

export default class profile implements IBotInteraction {

    name(): string {
        return "profile";
    } 

    help(): string {
        return "View your net worth and AOPSelo";
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
        const aopsElo = await db.get(`${user.id}.pointsAOPS`);
        const valuation = await markToMarket(user.id, true);

        const embed = new EmbedBuilder()
            .setTitle(`${user.username}'s Profile`)
            .setDescription(`Overview for ${user.username}`)
            .setColor(0x5865f2)
            .addFields(
                { name: 'Net Worth', value: `**${valuation ? this.safeCurrency(valuation.netWorth) : 'N/A'}**`, inline: true },
                { name: 'AOPSelo', value: aopsElo ? `**${Math.floor(aopsElo)}**` : 'N/A', inline: true },
            )
            .addFields(
                { name: 'Time-Weighted Return', value: valuation ? `**${this.safePercentage(valuation.twr)}**` : 'N/A', inline: true },
            )
            .setTimestamp(new Date())
            .setFooter({ text: 'Profile' });

        const avatar = user.avatarURL();
        if (avatar) {
            embed.setAuthor({ name: user.username, iconURL: avatar });
            embed.setThumbnail(avatar);
        } else {
            embed.setAuthor({ name: user.username });
        }
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

    private safeCurrency(value?: number) {
        if (value == null || !Number.isFinite(value)) return 'N/A';
        return value.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 2,
        });
    }

    private safePercentage(value?: number) {
        if (value == null || !Number.isFinite(value)) return 'N/A';
        return `${(value * 100).toFixed(2)}%`;
    }
}
