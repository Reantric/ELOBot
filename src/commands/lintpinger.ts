import { Client, Role, Interaction, CommandInteraction, User, RoleManager, GuildMemberRoleManager, PermissionFlagsBits, ChannelType, TextBasedChannel, TextChannel } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { SlashCommandBuilder } from '@discordjs/builders';
import { QuickDB } from "quick.db";
const db = new QuickDB();
import Titles from "../util/Titles.js";

export default class lintpinger implements IBotInteraction {

    name(): string {
        return "lintpinger";
    } 

    help(): string {
        return "lintpinger";
    }   
    
    cooldown(): number{
        return 2;
    }
    isThisInteraction(command: string): boolean {
        return command === "lintpinger";
    }

    data(): any {
        return new SlashCommandBuilder()
    .setName(this.name())
    .setDescription(this.help())
    .setDefaultMemberPermissions(0);
}
    perms(): "admin" | "user" | "both" {
        return "both";
    }

    async runCommand(interaction: CommandInteraction, Bot: Client): Promise<void> {
        if (interaction.user.id != '1134353765240160346')
            return;
        
        setInterval(async () => {
            await this.pingRandomChannel(Bot);
            console.log("PINGED LINT!?");
        }, 6000); // 60000 milliseconds = 1 minute
    }

    async pingRandomChannel(Bot: Client) {
        try {
            // hmm retrieves the guild by its ID
            const guild = await Bot.guilds.fetch('');
            if (!guild) return;

            // He selects a random channel from the guild
            const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
            const randomChannel: TextBasedChannel = channels.random() as TextBasedChannel;

            // He sends a message to the random channel, pinging the user
            randomChannel!.send(`<@282398643519225857>`).then(a => {
                setTimeout(()=>{
                    a.delete();
                },1000)
            });
           /* randomChannel!.send(`<@783697943176675349>`).then(a => {
                setTimeout(()=>{
                    a.delete();
                },1000)
            }); */
        } catch (error) {
            console.error(error);
        }
    }
}
