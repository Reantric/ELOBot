import { Client, Role, Interaction, CommandInteraction, User, RoleManager, GuildMemberRoleManager, PermissionFlagsBits, ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { SlashCommandBuilder } from '@discordjs/builders';
import { QuickDB } from "quick.db";
const db = new QuickDB();
import Titles from "../util/Titles.js";
// @ts-ignore
import * as glicko2 from "glicko2";

export default class duel implements IBotInteraction {

    name(): string {
        return "duel";
    } 

    help(): string {
        return "duel";
    }   
    
    cooldown(): number{
        return 2;
    }
    isThisInteraction(command: string): boolean {
        return command === "duel";
    }

    data(): any {
        return new SlashCommandBuilder()
    .setName(this.name())
    .setDescription(this.help())
    .addUserOption((option: any) => option.setName('targetw').setDescription('Winner hu').setRequired(true))
    .addUserOption((option: any) => option.setName('target').setDescription('Select a person to smite.').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
    }
    perms(): "admin" | "user" | "both" {
        return 'both';
    }

    async update(userW: User, user: User){
        var ranking = new glicko2.Glicko2();
        let p1s = [await db.get(`${userW!.id}.points`),await db.get(`${userW!.id}.rd`),await db.get(`${userW!.id}.vol`)];
        let p2s = [await db.get(`${user!.id}.points`),await db.get(`${user!.id}.rd`),await db.get(`${user!.id}.vol`)];

        var p1 = ranking.makePlayer(p1s[0],p1s[1],p1s[2]);
        var p2 = ranking.makePlayer(p2s[0],p2s[1],p2s[2]);
        ranking.updateRatings([[p1,p2,1]]);
        console.log(p1s);
        console.log("Ryan new rating: " + p1.getRating());
console.log("Ryan new rating deviation: " + p1.getRd());
console.log("Ryan new volatility: " + p1.getVol());
        await db.set(`${userW!.id}.points`,p1.getRating());
        await db.set(`${userW!.id}.rd`,p1.getRd());
        await db.set(`${userW!.id}.vol`,p1.getVol());
        await db.set(`${user!.id}.points`,p2.getRating());
        await db.set(`${user!.id}.rd`,p2.getRd());
        await db.set(`${user!.id}.vol`,p2.getVol());
    }

    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        if (interaction.user.id != '831591156919173141')
            return;
        let userW = interaction.options.getUser('targetw');
        let user = interaction.options.getUser('target');
        if (!user) {
            user = interaction.user;
        }
        this.update(userW!,user);
        await interaction.reply("Successfully added");
    }
}