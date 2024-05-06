import { ChatInputCommandInteraction, Client, GuildMemberRoleManager, PermissionFlagsBits, Role, SlashCommandStringOption } from "discord.js";
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


        let embed = new EmbedBuilder();
        let isTeacher = (interaction.member!.roles as GuildMemberRoleManager).cache.some((role: { name: string; }) => role.name === 'napoleon' || role.name === 'God');
        embed.setTitle('Linty Command List')
        .setDescription(`Here are a list of our ${isTeacher ? 'admin' : 'user'} commands.`)
        .setColor('Blurple');
        helpUtil.get().forEach((helpPerm: string[], name: string) => {
            if ((helpPerm[1] != 'user' && isTeacher) || (helpPerm[1] != 'admin' && !isTeacher)) {
                embed.addFields({
                    name: '/' + name, 
                    value: helpPerm[0]
                });
            }
        })
        await interaction.reply({embeds: [embed], ephemeral: true});  
    }   
}
}
