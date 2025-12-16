import { ChannelType, ChatInputCommandInteraction, Client, GuildMemberRoleManager, PermissionFlagsBits, Role, SlashCommandStringOption, TextBasedChannel, TextChannel } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { SlashCommandBuilder }from "@discordjs/builders"
import { helpUtil } from "../index.js";

export default class help implements IBotInteraction {

    name(): string {
        return "help";
    } 

    help(): string {
        return "A list of all commands available to you.";
    }   
    
    cooldown(): number{
        return 2;
    }
    isThisInteraction(command: string): boolean {
        return command === "help";
    }

    data(): any {
        return new SlashCommandBuilder()
		.setName(this.name())
		.setDescription(this.help())
        .addStringOption((option: SlashCommandStringOption) =>
            option.setName("which")
            .setDescription("what command")
            .setRequired(false));
    }
    perms(): "admin" | "user" | "both" {
        return 'both';
     }

    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        if (interaction.options.getString("which")){
            let outp: string[] = helpUtil.get().get(interaction.options.getString("which")!) as string[];
            let commandHelp = outp[0];
            let perm = outp[1];
            let isTeacher = (interaction.member!.roles as GuildMemberRoleManager).cache.some((role: { name: string; }) => role.name === 'napoleon' || role.name === 'God');
            if (perm == 'admin' && !isTeacher)
                return;
            await interaction.reply({ content: commandHelp, ephemeral: true }); 
            return;
        } else {


        const embed = new EmbedBuilder();
        const isTeacher = (interaction.member!.roles as GuildMemberRoleManager).cache.some((role: { name: string; }) => role.name === 'napoleon' || role.name === 'God');
        const description = `Here are a list of our ${isTeacher ? 'admin' : 'user'} commands.`;
        embed.setTitle('Linty Command List')
            .setDescription(description)
            .setColor('Blurple');

        const accessibleCommands: { name: string; value: string }[] = [];
        helpUtil.get().forEach((helpPerm: string[], name: string) => {
            if ((helpPerm[1] != 'user' && isTeacher) || (helpPerm[1] != 'admin' && !isTeacher)) {
                accessibleCommands.push({
                    name: '/' + name,
                    value: helpPerm[0],
                });
            }
        });

        const embeds: EmbedBuilder[] = [];
        const chunkSize = 25;
        for (let i = 0; i < accessibleCommands.length; i += chunkSize) {
            const chunk = accessibleCommands.slice(i, i + chunkSize);
            const embedPart = i === 0
                ? embed
                : new EmbedBuilder()
                    .setTitle('Linty Command List (cont.)')
                    .setColor('Blurple');
            embedPart.addFields(chunk);
            embeds.push(embedPart);
        }

        if (embeds.length === 0) {
            embed.setDescription(`${description}\n\nNo commands are available to you right now.`);
            embeds.push(embed);
        }

        await interaction.reply({ embeds, ephemeral: true });  
    }   
}
}
