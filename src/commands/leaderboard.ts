import { CommandInteraction, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle, Interaction, ButtonInteraction } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { IBotInteraction } from "../api/capi";
import { QuickDB } from "quick.db";
import Titles from '../util/Titles.js';

const db: QuickDB = new QuickDB();

export default class Leaderboard implements IBotInteraction {
    private readonly aliases = ["leaderboard", "lb"];

    name(): string {
        return "leaderboard";
    }

    help(): string {
        return "Displays a points leaderboard!";
    }

    cooldown(): number {
        return 600;
    }

    isThisInteraction(command: string): boolean {
        return this.aliases.includes(command);
    }

    data(): any {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help());
    }

    perms(): "admin" | "user" | "both" {
        return 'both';
    }

    async runCommand(interaction: CommandInteraction): Promise<void> {
        // Fetch data from database
        const leaderboardData = await this.fetchLeaderboardData(interaction.guild!.id, interaction);

        // Create and send the embed with pagination
        const embed = this.createLeaderboardEmbed(leaderboardData, 0, interaction); // Start at page 0
        const buttons: any = this.createPaginationButtons(0);
        await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: false });

        let currentPage = 0;

        const filter = (i: Interaction) => i.isButton() && i.user.id === interaction.user.id;

        const collector = interaction.channel?.createMessageComponentCollector({ filter, time: 60000 }); // 1 minute for interaction

        collector?.on('collect', async (i: ButtonInteraction) => {
            await i.deferUpdate(); // acknowledge the interaction

            // Extract the direction and page number from the customId
            const [direction, pageStr] = i.customId.split('_');
            currentPage = parseInt(pageStr, 10);

            if (direction === 'next') {
                currentPage++;
            } else if (direction === 'previous' && currentPage > 0) { // Prevent going to negative pages
                currentPage--;
            }

            // Fetch new data for the page (if your data might change in real-time) or slice the existing data
            // const newLeaderboardData = await this.fetchLeaderboardData(interaction.guild!.id, interaction);

            const newEmbed = this.createLeaderboardEmbed(leaderboardData, currentPage, interaction); // use newLeaderboardData if you fetched fresh data
            const newButtons: any = this.createPaginationButtons(currentPage);

            await i.editReply({ embeds: [newEmbed], components: [newButtons] });
        });

        collector?.on('end', () => {

        });


    }

    private createPaginationButtons(currentPage: number): ActionRowBuilder {
        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`previous_${currentPage}`)  // Embedding the current page number
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === 0),  // Disable if it's the first page
                new ButtonBuilder()
                    .setCustomId(`next_${currentPage}`)  // Embedding the current page number
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary),
            );

        return buttons;
    }

    private isNumber(value?: string | number): boolean
    {
       return ((value != null) &&
               (value !== '') &&
               !isNaN(Number(value.toString())));
    }

    private createLeaderboardEmbed(userArray: [string, number, number][], page: number, interaction: CommandInteraction): EmbedBuilder {
        const begint = page * 10;
        const endt = Math.min(userArray.length - 1, begint + 9);
        const embed = new EmbedBuilder()
            .setTitle('ELO Leaderboard')
            .setColor('Aqua')
            .setDescription('💀 Here are the top Fuckers who have the highest Ratings!? 💀 ')
            .setTitle('Points Leaderboard!')
            .setAuthor({name: interaction.user!.username, iconURL: interaction.user!.avatarURL()!})
           // .setImage('https://i.redd.it/l28662sbcec51.png')
            .setTimestamp()
            .setThumbnail('https://i.imgur.com/aowYZQG.jpeg');

        for (var i = begint; i <= endt; ++i) {
            let username: any = userArray[i][0];
            var title = "";
            if (this.isNumber(userArray[i][0]))
                username = interaction.client.users.cache.find(user => user.id === userArray[i][0])?.username;//cannot read property 0 of indefined
            else
                title = "**BOT**";
            let rounded;
            let stable = "";
            if (isNaN(userArray[i][1])) {
                console.log(username, userArray[i]);
                rounded = NaN;
                // userArray[i][1] = "N/A";
            }
            else
                rounded = Math.round(userArray[i][1]);
            
            let initializer = "";

            if (i == 0)
                initializer = `<:first_place:822885876144275499>`;
            else if (i == 1)
                initializer = `<:second_place:822887005679648778>`;
            else if (i == 2)
                initializer = `<:third_place:822887031143137321>`;


            var value: any = userArray[i][1];
            if (userArray[i][2] > 150)
                stable="?";
            
            if (isNaN(value))
                value = "N/A"
            else if (stable=="" && title == "")
                title = Titles.getAbbrev(value);
            if (userArray[i][0] == interaction.member!.user.id)
                embed.addFields(
                    { name: `${initializer} **#${(i + 1)}: ${title} ${username}** (You)`, value: `**${rounded}**${stable}` },)
            else
                embed.addFields(
                    { name: `${initializer} #${(i + 1)}: ${title} ${username}`, value: `${rounded}${stable}` },)
        }

        let ind = this.search(userArray,interaction.member!.user.id);
        let initializer = "";

                if(ind==0)
                        initializer = `<:first_place:822885876144275499>`;
                else if(ind==1)
                        initializer = `<:second_place:822887005679648778>`;                
                else if(ind==2)
                        initializer = `<:third_place:822887031143137321>`;
        
                        
        
        var stable = "";
        var title = "";
        if (stable=="")
            title = Titles.getAbbrev(userArray[ind][1]);
        if (userArray[ind][2] > 150)
            stable="?";
        embed.addFields({
            name: `You → ${initializer} **#${ind+1}: ${title} ${interaction.member!.user.username}**`,
            value:`**${Number(Math.round(userArray[ind][1]))}**${stable}`
        });

        return embed;

    }
    
    private search(array: any[][], targetValue: any) {
        // genuinely shitty algorithm, use BS later
        for (var i = 0; i < array.length; i++){
            if (array[i][0] == targetValue)
                return i;
        }
        return -1;
    }


    private async fetchLeaderboardData(guildId: string, interaction: CommandInteraction): Promise<[string, number,number][]> {
        let userArray: [string, number, number][] = [];
        let guildArray = interaction.guild!.members.cache.map((element: any) => {
            return element.id
        })

        for (const o of await db.all()) {
            if (o.id == process.env.CLIENT_ID)
                continue;
            if (this.isNumber(o.id) && (o.value.bot === undefined || !o.value.bot)){ // fix later
                if (guildArray.includes(o.id)) {
                    let pts,rd;
                    if (typeof o.value === 'string'){
                        pts = JSON.parse(o.value).points;
                        rd = JSON.parse(o.value).rd;
                    }
                    else {
                        pts = o.value.points;
                        rd = o.value.rd;
                    }
                    userArray.push([o.id, pts,rd])
                }
            } else {
                console.log("Roger?");
                userArray.push([o.id,o.value.points,o.value.rd]);
            }
        }
        userArray.sort((a: [string, number,number], b: [string, number,number]) => {
            return b[1] - a[1];
        });

        return userArray;

    }
}
