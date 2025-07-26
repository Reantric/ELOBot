import { Client, Role, Interaction, CommandInteraction, User, RoleManager, GuildMemberRoleManager, ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { SlashCommandBuilder } from '@discordjs/builders';
import { QuickDB } from "quick.db";
const db = new QuickDB();
import Titles from "../util/Titles.js";
import { signAndVerifyMessage } from "../util/pgp.js";
import { uploadToPastebin } from "../util/pastebin.js";
import { calculateAndApplyJtohInterest, setJtohTime } from "../util/jtohInterest.js";

export default class jtoh implements IBotInteraction {

    name(): string {
        return "jtoh";
    } 

    help(): string {
        return "Get or add JToH time";
    }   
    
    cooldown(): number{
        return 2;
    }
    isThisInteraction(command: string): boolean {
        return command === "jtoh";
    }

    data(): any {
        return new SlashCommandBuilder()
		.setName(this.name())
		.setDescription(this.help())
        .addNumberOption(option => 
            option.setName('time')
                .setDescription('Time to add to your JToH record (in minutes)')
                .setRequired(false)
        )
    }
    perms(): "admin" | "user" | "both" {
        return 'both';
    }

     async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
    
        
        const userId = '1134353765240160346';

        if (interaction.user.id == '118663865264242688') {
            if (interaction.options.getNumber('time') === null){
            interaction.reply({content: "You have no power here, Snowflake... Only the Amog may add and the Log may remove..."});
            return;
            }
        }

        if (interaction.user.id == '412937618695782420'){
            interaction.reply({content: "That's clever. Nice try."});
            return;
        }
        const timeToAdd = interaction.options.getNumber('time') || 0;
        
        // Calculate current time with interest applied
        const timeWithInterest = await calculateAndApplyJtohInterest();
        
        // Calculate new time after adding input
        const newTime = timeWithInterest + timeToAdd;
        
        // Update database with final time
        await setJtohTime(newTime);
        const embed = new EmbedBuilder();

        const newTimeInSeconds = Math.floor(newTime * 60);
        
        let title: [string,ColorResolvable, number[],string, string];
        switch (true) {
            case newTimeInSeconds < 300:
                title = Titles.Title[0];
                break;
            case newTimeInSeconds < 600:
                title = Titles.Title[1];
                break;
            case newTimeInSeconds < 1200:
                title = Titles.Title[2];
                break;
            case newTimeInSeconds < 2400:
                title = Titles.Title[3];
                break;
            case newTimeInSeconds < 4800:
                title = Titles.Title[4];
                break;
            case newTimeInSeconds < 1 * Math.pow(10, 4):
                title = Titles.Title[5];
                break;
            case newTimeInSeconds < 3 * Math.pow(10, 4):
                title = Titles.Title[6];
                break;
            case newTimeInSeconds < 1 * Math.pow(10, 5):
                title = Titles.Title[7];
                break;
            case newTimeInSeconds < 5 * Math.pow(10, 5):
                title = Titles.Title[8];
                break;
            case newTimeInSeconds < 8.6 * Math.pow(10, 6):
                title = Titles.Title[9];
                break;
            default:
                title = Titles.Title[10];
                break;
        }

        let pgpMessage = await signAndVerifyMessage(`JToH Time Status for LOG. \n\nTime: ${newTime} minutes\nLoan Status: ${title[0]}. This was not Snow.`);
        const pastebinUrl = await uploadToPastebin(pgpMessage.signed);
        console.log('Pastebin URL:', pastebinUrl);
        embed.setTitle(`JToH Time Status for Log`)
        .setColor(title[4] as ColorResolvable)
        .addFields({
            name: 'JToH Time',
            value: `**${newTime}** minutes`,
            inline: true
        })
        .addFields({
            name: 'Loan Status:',
            value: `**${title[0]}**`,
            inline: true
        }).addFields({
            name: 'Anti-Spoof Snow Measures',
            value: `[View PGP Signature](${pastebinUrl})\n[Verify Signature](https://pgp.najm.uk/#verify)\nTo view the public key, use \`/about\``,
        })
        .setFooter({text: "Amog Credit Agency"})
        .setTimestamp(new Date());
        interaction.reply({embeds: [embed]} );
    }
}
