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
import rr from "./renderer.js";
let Renderer = new rr()

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

        await interaction.deferReply();
        const answers = [
    {
        label: 'A',
        description: 'oke',
        value: 'A'
    },
    {
        label: 'B',
        description: 'oke',
        value: 'B'
    },
    {
        label: 'C',
        description: 'oke',
        value: 'C'
    },
    {
        label: 'D',
        description: 'oke',
        value: 'D'
    },
    {
        label: 'E',
        description: 'oke',
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

        const stuff = await Renderer.render(probStatement);
        // hmm file name and
        const file = stuff[1] as AttachmentBuilder;
        const a = stuff[0];
        
        // set color based on rating
        const skinnyEmbed = new EmbedBuilder()
    .addFields(
        { name: 'Rating', value: `||69420||`, inline: true },
        { name: 'Hint', value: `|| idk man i'll figure this out later ||`, inline: true }
    );



        // Sending the question embed and the select menu
        let msgToHold = await interaction.editReply!({
            content: `<@${interaction.user.id}>`, // Replace 'RoleId' with the actual role ID
            components: [row],
            files: [file],
            embeds: [skinnyEmbed]
        });

        fs.unlink((a as any), (err: any) => {
            if (err) {
                console.error('Error deleting the file:', err);
            } else {
                console.log('File successfully deleted');
            }
        });

        const collector = msgToHold.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: expiration });
        let tryCount = 1
        collector.on('collect', async i => {
            const selection = i.values[0].trim();  // Trimming any extra whitespace
            let verdict = selection == answer ? "RIGHT!?" : "WRONG!";  // Using strict comparison and ternary operator for clarity
        
            await i.reply(`${i.user} has selected ${selection}... and they are ${verdict}`);
        
            if (verdict === "RIGHT!?") {
                collector.stop('answerCorrect');  // Stop the collector with a reason
                
            } else {
                // Optionally handle the wrong answer case, e.g., logging, counting attempts, etc.
                tryCount++;
            }
        });
    

        collector.on('end', async collected => {
            console.log(`Collected ${collected.size} interactions.`);
            await msgToHold.edit({
                content: "IT'S OVER, YOU HUE!?"
            });
            if (tryCount == 1){
                interaction.channel?.send("Nice, you got it right. I will remember this.")
            }
        });
                
    }
}

