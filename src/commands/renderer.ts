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

   /*async render1(interaction: ChatInputCommandInteraction, formula: string){
        convertLatexToImage(formula,'JPG', '100%').then(async (a: String) => {
            const file = new AttachmentBuilder(`${a}`);
            const b = await interaction.editReply({ files: [file] });
            fs.unlink((a as any), (err: any) => {
                if (err) {
                    console.error('Error deleting the file:', err);
                } else {
                    console.log('File successfully deleted');
                }
            });
        });
    } */

   async render(formula: string){
        try {
            const imagePath = await convertLatexToImage(formula, 'JPG', '100%');
            const attachment = new AttachmentBuilder(imagePath);
            return [imagePath, attachment];
        } catch (error) {
            console.error('Failed to convert formula to image:', error);
            throw new Error('Image conversion failed');
        }
    }

    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        if (interaction.user.id != '1134353765240160346')
            return; 
        await interaction.deferReply();
        let formula: string = interaction.options.getString("which") as string;
        //this.render(interaction,formula);  
        const stuff = await this.render(formula);
        const file = stuff[1] as AttachmentBuilder;
        const a = stuff[0];

        await interaction.editReply({ files: [file] });
            fs.unlink((a as any), (err: any) => {
                if (err) {
                    console.error('Error deleting the file:', err);
                } else {
                    console.log('File successfully deleted');
                }
            });
    }
}
