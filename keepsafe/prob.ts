import { Client, Role, Interaction, CommandInteraction, User, RoleManager, GuildMemberRoleManager, PermissionFlagsBits, CommandInteractionOptionResolver, ChatInputCommandInteraction, SlashCommandStringOption, AttachmentBuilder, Message, ActionRowBuilder, SelectMenuBuilder, ComponentType } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { SlashCommandBuilder } from '@discordjs/builders';
import { QuickDB } from "quick.db";
const db = new QuickDB();
import convertToLatex from "../util/Texer.js";
import * as fs from 'fs';
import { randProb } from "../util/randProbGen.js";
import { StringSelectMenuBuilder } from "discord.js";
import { ButtonBuilder } from "discord.js";

export default class prob implements IBotInteraction {

    name(): string {
        return "prob";
    } 

    help(): string {
        return "prob";
    }   
    
    cooldown(): number{
        return 120;
    }
    isThisInteraction(command: string): boolean {
        return command === "prob";
    }

    data() {
        return new SlashCommandBuilder()
    .setName(this.name())
    .setDescription(this.help())
}
    perms(): "admin" | "user" | "both" {
        return 'both';
    }


    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        const hi: any[] = await randProb() as any[];
        let probStatement = hi[0];
        let probAnswer = hi[1];
        let answer = hi[2];

//interaction.deferReply();
const answers = [
    {
        label: 'A',
        description: '',
        value: 'A'
    },
    {
        label: 'B',
        description: '',
        value: 'B'
    },
    {
        label: 'C',
        description: '',
        value: 'C'
    },
    {
        label: 'D',
        description: '',
        value: 'D'
    },
    {
        label: 'E',
        description: '',
        value: 'E'
    }
];

        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select')
                    .setPlaceholder('Pick an answer!')
                    .addOptions(answers)
            );
        
        let expiration = 20*60*1000;
        let questionText = probStatement;

        const file = new AttachmentBuilder('tex/img-38b4c2c4f60049da.jpg');
        const questionEmbed = new EmbedBuilder()
            .setTitle("Multiple-Choice Question")
            .setDescription(`**${questionText}**\n\nSelect one of the following answers:`)
            .setImage('attachment://img-38b4c2c4f60049da.jpg')
            .setColor(0xF1C40F)
            .setFooter({ text: `This question expires in ${expiration} second(s).` })
            .setTimestamp();

        // Sending the question embed and the select menu
        let msgToHold = await interaction.reply!({
            content: `<@${interaction.user.id}>`, // Replace 'RoleId' with the actual role ID
            embeds: [questionEmbed],
            components: [row],
            files: [file] 
        });

        const collector = msgToHold.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: expiration });

        collector.on('collect', async i => {
            const selection = i.values[0];
            await i.reply(`${i.user} has selected ${selection}!`);
        });

        collector.on('end', async collected => {
            console.log(`Collected ${collected.size} interactions.`);
            await msgToHold.edit({
                content: "IT'S OVER, YOU HUE!?"
            });
        });
                
    }
}

