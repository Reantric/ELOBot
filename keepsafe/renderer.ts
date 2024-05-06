import { Client, Role, Interaction, CommandInteraction, User, RoleManager, GuildMemberRoleManager, PermissionFlagsBits, CommandInteractionOptionResolver, ChatInputCommandInteraction, SlashCommandStringOption, AttachmentBuilder } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { SlashCommandBuilder } from '@discordjs/builders';
import { QuickDB } from "quick.db";
const db = new QuickDB();
import convertToLatex from "../util/Texer.js";

import * as fs from 'fs';
import convertLatexToImage from "../util/Texer.js";

export default class renderer implements IBotInteraction {

    name(): string {
        return "renderer";
    } 

    help(): string {
        return "renderer";
    }   
    
    cooldown(): number{
        return 2;
    }
    isThisInteraction(command: string): boolean {
        return command === "renderer";
    }

    data() {
        return new SlashCommandBuilder()
    .setName(this.name())
    .setDescription(this.help())
    .addStringOption((option: SlashCommandStringOption) =>
        option.setName("which")
        .setDescription("what tex")
        .setRequired(true));
}
    perms(): "admin" | "user" | "both" {
        return 'both';
    }

    async render(interaction: ChatInputCommandInteraction, formula: string){
        convertLatexToImage(formula,'JPG', '100%').then(async (a: String) => {
            const file = new AttachmentBuilder(`${a}`);
            const b = await interaction.reply({ files: [file] });
            fs.unlink((a as any), (err: any) => {
                if (err) {
                    console.error('Error deleting the file:', err);
                } else {
                    console.log('File successfully deleted');
                }
            });
        });
    }

    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        if (interaction.user.id != '1134353765240160346')
            return; 
        
        let formula: string = interaction.options.getString("which") as string;
        this.render(interaction,formula);     
    }
}
