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
        
        // Function to get qualifier based on position within tier
        const getQualifier = (timeInSeconds: number, lowerBound: number, upperBound: number): string => {
            const range = upperBound - lowerBound;
            const position = timeInSeconds - lowerBound;
            const percentile = (position / range) * 100;
            
            switch (true) {
                case percentile <= 1: return "Baseline";     // Within 1% of lower bound (higher time direction)
                case percentile <= 10: return "Bottom";      // 1-10%
                case percentile <= 20: return "Bottom Low";  // 11-20%
                case percentile <= 30: return "Low";         // 21-30%
                case percentile <= 40: return "Low Mid";     // 31-40%
                case percentile <= 50: return "Mid";         // 41-50%
                case percentile <= 60: return "Mid High";    // 51-60%
                case percentile <= 70: return "High";        // 61-70%
                case percentile <= 80: return "High Peak";   // 71-80%
                case percentile <= 90: return "Peak";        // 81-90%
                default: return "Peak";                      // 90-99%
            }
        };
        
        let title: [string,ColorResolvable, number[],string, string];
        let qualifier = "";
        let lowerBound = 0;
        let upperBound = 0;
        
        switch (true) {
            case newTimeInSeconds < 300:
                title = Titles.Title[0];
                lowerBound = 0;
                upperBound = 300;
                break;
            case newTimeInSeconds < 600:
                title = Titles.Title[1];
                lowerBound = 300;
                upperBound = 600;
                break;
            case newTimeInSeconds < 1200:
                title = Titles.Title[2];
                lowerBound = 600;
                upperBound = 1200;
                break;
            case newTimeInSeconds < 2400:
                title = Titles.Title[3];
                lowerBound = 1200;
                upperBound = 2400;
                break;
            case newTimeInSeconds < 4800:
                title = Titles.Title[4];
                lowerBound = 2400;
                upperBound = 4800;
                break;
            case newTimeInSeconds < 1 * Math.pow(10, 4):
                title = Titles.Title[5];
                lowerBound = 4800;
                upperBound = 1 * Math.pow(10, 4);
                break;
            case newTimeInSeconds < 3 * Math.pow(10, 4):
                title = Titles.Title[6];
                lowerBound = 1 * Math.pow(10, 4);
                upperBound = 3 * Math.pow(10, 4);
                break;
            case newTimeInSeconds < 1 * Math.pow(10, 5):
                title = Titles.Title[7];
                lowerBound = 3 * Math.pow(10, 4);
                upperBound = 1 * Math.pow(10, 5);
                break;
            case newTimeInSeconds < 5 * Math.pow(10, 5):
                title = Titles.Title[8];
                lowerBound = 1 * Math.pow(10, 5);
                upperBound = 5 * Math.pow(10, 5);
                break;
            case newTimeInSeconds < 8.6 * Math.pow(10, 6):
                title = Titles.Title[9];
                lowerBound = 5 * Math.pow(10, 5);
                upperBound = 8.6 * Math.pow(10, 6);
                break;
            default:
                title = Titles.Title[10];
                lowerBound = 8.6 * Math.pow(10, 6);
                upperBound = 8.6 * Math.pow(10, 6) * 2; // Assume double for highest tier
                break;
        }
        
        // Calculate qualifier for the tier
        qualifier = getQualifier(newTimeInSeconds, lowerBound, upperBound);
        
        // Combine qualifier with title
        const fullTitle = qualifier === "Baseline" ? `${qualifier} ${title[0]}` : `${qualifier} ${title[0]}`;
        
        // Override the title name for display
        const displayTitle: [string,ColorResolvable, number[],string, string] = [
            fullTitle,
            title[1],
            title[2], 
            title[3],
            title[4]
        ];

        let pgpMessage = await signAndVerifyMessage(`JToH Time Status for LOG. \n\nTime: ${newTime} minutes\nLoan Status: ${displayTitle[0]}. This was not Snow.`);
        const pastebinUrl = await uploadToPastebin(pgpMessage.signed);
        console.log('Pastebin URL:', pastebinUrl);
        embed.setTitle(`JToH Time Status for Log`)
        .setColor(displayTitle[4] as ColorResolvable)
        .addFields({
            name: 'JToH Time',
            value: `**${newTime}** minutes`,
            inline: true
        })
        .addFields({
            name: 'Loan Status:',
            value: `**${displayTitle[0]}**`,
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
