import { Client, Role, Interaction, CommandInteraction, User, RoleManager, GuildMemberRoleManager, PermissionFlagsBits, CommandInteractionOptionResolver, ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { SlashCommandBuilder } from '@discordjs/builders';
import { QuickDB } from "quick.db";
const db = new QuickDB();
import Titles from "../util/Titles";

export default class add implements IBotInteraction {

    name(): string {
        return "add";
    } 

    help(): string {
        return "add";
    }   
    
    cooldown(): number{
        return 2;
    }
    isThisInteraction(command: string): boolean {
        return command === "add";
    }

    data() {
        return new SlashCommandBuilder()
    .setName(this.name())
    .setDescription(this.help())
    .addIntegerOption((option:any) => 
        option.setName('skulls')
            .setDescription('How many Lintys are you bestowing upon?')
            .setRequired(true))
    .addUserOption((option: any) => option.setName('target').setDescription('Select a person to smite.').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
}
    perms(): "admin" | "user" | "both" {
        return 'both';
    }

    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        if (interaction.user.id != '1134353765240160346')
            return;
       
        let user = interaction.options.getUser("target");
        if (!user) {
            user = interaction.user;
        } 
        const pts: any = interaction.options.get("skulls")?.value;
        db.add(`${user.id}.points`,pts);
        interaction.reply("Successfully added");
    }
}
