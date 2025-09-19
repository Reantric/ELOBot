import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle, Interaction, ButtonInteraction } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { IBotInteraction } from "../api/capi";
import { QuickDB } from "quick.db";
import Titles from '../util/Titles.js';
import { ensureAccount, listAccounts } from '../util/trading/dataStore.js';
import { markToMarket } from '../util/trading/portfolio.js';
import { formatPercentage } from '../util/trading/view.js';

type LeaderboardMode = 'NIM' | 'AOPS' | 'MARKET';

interface MarketLeaderboardRow {
    userId: string;
    netWorth: number;
    pnl: number;
    twr: number;
}

const db: QuickDB = new QuickDB();

export default class Leaderboard implements IBotInteraction {
    private readonly aliases = ["leaderboard", "lb"];

    name(): string {
        return "leaderboard";
    }

    private createMarketLeaderboardEmbed(
        entries: MarketLeaderboardRow[],
        page: number,
        interaction: ChatInputCommandInteraction
    ): EmbedBuilder {
        const begin = page * 10;
        const end = Math.min(entries.length - 1, begin + 9);
        const embed = new EmbedBuilder()
            .setTitle('Market Leaderboard!')
            .setColor('Aqua')
            .setDescription('💀 Here are the top Fuckers who have the highest Ratings!? 💀 ')
            .setAuthor({ name: interaction.user.username, iconURL: interaction.user.avatarURL() ?? undefined })
            .setTimestamp()
            .setThumbnail('https://i.imgur.com/diav5WK.png');

        for (let i = begin; i <= end; i += 1) {
            const row = entries[i];
            const member = interaction.guild?.members.cache.get(row.userId);
            const username = member?.displayName ?? member?.user.username
                ?? interaction.client.users.cache.get(row.userId)?.username
                ?? row.userId;

            let initializer = '';
            if (i === 0) initializer = `<:first_place:822885876144275499>`;
            else if (i === 1) initializer = `<:second_place:822887005679648778>`;
            else if (i === 2) initializer = `<:third_place:822887031143137321>`;

            const netRounded = Math.round(row.netWorth).toLocaleString();
            const valueText = `**${netRounded}** | P/L ${this.formatSignedCurrency(row.pnl)} | TWR ${this.formatSignedPercentage(row.twr)}`;

            if (row.userId === interaction.user.id) {
                embed.addFields({
                    name: `${initializer} **#${i + 1}: ${username}** (You)` ,
                    value: valueText,
                });
            } else {
                embed.addFields({
                    name: `${initializer} #${i + 1}: ${username}`,
                    value: valueText,
                });
            }
        }

        const selfIndex = entries.findIndex(entry => entry.userId === interaction.user.id);
        if (selfIndex >= 0 && (selfIndex < begin || selfIndex > end)) {
            const row = entries[selfIndex];
            const netRounded = Math.round(row.netWorth).toLocaleString();
            embed.addFields({
                name: `You → **#${selfIndex + 1}: ${interaction.user.username}**`,
                value: `**${netRounded}** | P/L ${this.formatSignedCurrency(row.pnl)} | TWR ${this.formatSignedPercentage(row.twr)}`,
            });
        }

        return embed;
    }

    private async paginateLeaderboard(
        interaction: ChatInputCommandInteraction,
        data: [string, number, number][] | MarketLeaderboardRow[],
        lbtype: LeaderboardMode
    ): Promise<void> {
        if (data.length === 0) {
            const message = lbtype === 'MARKET'
                ? 'No paper trading accounts found yet. Try running /buy to open a position first.'
                : `No ${lbtype} ratings found.`;
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: message, components: [] });
            } else {
                await interaction.reply({ content: message, ephemeral: true });
            }
            return;
        }

        const totalPages = Math.max(Math.ceil(data.length / 10), 1);
        const getEmbed = (page: number) => lbtype === 'MARKET'
            ? this.createMarketLeaderboardEmbed(data as MarketLeaderboardRow[], page, interaction)
            : this.createLeaderboardEmbed(data as [string, number, number][], page, interaction, lbtype);

        const initialEmbed = getEmbed(0);
        const components = totalPages > 1 ? [this.createPaginationButtons(0, totalPages)] : [];

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [initialEmbed], components });
        } else {
            await interaction.reply({ embeds: [initialEmbed], components, ephemeral: false });
        }

        if (totalPages === 1) {
            return;
        }

        let currentPage = 0;
        const filter = (i: Interaction) => i.isButton() && i.user.id === interaction.user.id;
        const collector = interaction.channel?.createMessageComponentCollector({ filter, time: 60000 });

        collector?.on('collect', async (i: ButtonInteraction) => {
            await i.deferUpdate();

            const [direction, pageStr] = i.customId.split('_');
            let originPage = parseInt(pageStr, 10);
            if (Number.isNaN(originPage)) originPage = currentPage;

            if (direction === 'next' && originPage < totalPages - 1) {
                currentPage = originPage + 1;
            } else if (direction === 'previous' && originPage > 0) {
                currentPage = originPage - 1;
            }

            const embed = getEmbed(currentPage);
            const row = this.createPaginationButtons(currentPage, totalPages);
            await i.editReply({ embeds: [embed], components: [row] });
        });
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
            .setDescription(this.help())
            .addStringOption(option =>
                option
                    .setName('lbtype')
                    .setDescription('Leaderboard type')
                    .addChoices(
                        { name: 'Market P/L', value: 'MARKET' },
                        { name: 'NIM', value: 'NIM' },
                        { name: 'AOPS', value: 'AOPS' },
                    )
            );
    }

    perms(): "admin" | "user" | "both" {
        return 'both';
    }

    async runCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        const lbtype = (interaction.options.getString('lbtype') as LeaderboardMode | null) ?? 'MARKET';

        if (!interaction.guild) {
            await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            return;
        }

        await interaction.guild.members.fetch();

        if (lbtype === 'MARKET') {
            const marketData = await this.fetchMarketLeaderboardData(interaction);
            await this.paginateLeaderboard(interaction, marketData, lbtype);
            return;
        }

        const ratingData = await this.fetchLeaderboardData(interaction.guild.id, interaction, lbtype);
        await this.paginateLeaderboard(interaction, ratingData, lbtype);
    }

    private createPaginationButtons(currentPage: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`previous_${currentPage}`)
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0),
                new ButtonBuilder()
                    .setCustomId(`next_${currentPage}`)
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage >= totalPages - 1),
            );
    }

    private isNumber(value?: string | number): boolean
    {
       return ((value != null) &&
               (value !== '') &&
               !isNaN(Number(value.toString())));
    }

    private createLeaderboardEmbed(userArray: [string, number, number][], page: number, interaction: ChatInputCommandInteraction, lbtype: 'NIM' | 'AOPS'): EmbedBuilder {
        const begint = page * 10;
        const endt = Math.min(userArray.length - 1, begint + 9);
        const embed = new EmbedBuilder()
            .setTitle(lbtype === 'AOPS' ? 'AOPS Leaderboard' : 'NIM Leaderboard')
            .setColor('Aqua')
            .setDescription('💀 Here are the top Fuckers who have the highest Ratings!? 💀 ')
            .setAuthor({name: interaction.user!.username, iconURL: interaction.user!.avatarURL()!})
           // .setImage('https://i.redd.it/l28662sbcec51.png')
            .setTimestamp()
            .setThumbnail('https://i.imgur.com/diav5WK.png');

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

        const ind = this.search(userArray, interaction.member!.user.id);
        if (ind >= 0) {
            let initializer = "";
            if (ind === 0)
                initializer = `<:first_place:822885876144275499>`;
            else if (ind === 1)
                initializer = `<:second_place:822887005679648778>`;
            else if (ind === 2)
                initializer = `<:third_place:822887031143137321>`;

            let stable = "";
            let title = Titles.getAbbrev(userArray[ind][1]);
            if (userArray[ind][2] > 150)
                stable = "?";
            embed.addFields({
                name: `You → ${initializer} **#${ind + 1}: ${title} ${interaction.member!.user.username}**`,
                value:`**${Number(Math.round(userArray[ind][1]))}**${stable}`
            });
        }

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

    private formatSignedCurrency(value: number): string {
        if (Number.isNaN(value) || !Number.isFinite(value)) return '—';
        const formatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
        });
        const formatted = formatter.format(Math.abs(Math.round(value)));
        if (value > 0) return `+${formatted}`;
        if (value < 0) return `-${formatted}`;
        return formatted;
    }

    private formatSignedPercentage(value: number): string {
        if (Number.isNaN(value) || !Number.isFinite(value)) return '—';
        const percentage = formatPercentage(Math.abs(value));
        if (value > 0) return `+${percentage}`;
        if (value < 0) return `-${percentage}`;
        return percentage;
    }


    private async fetchLeaderboardData(
        guildId: string,
        interaction: ChatInputCommandInteraction,
        lbtype: 'NIM' | 'AOPS'
    ): Promise<[string, number, number][]> {
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
                        const parsed = JSON.parse(o.value);
                        pts = lbtype === 'AOPS' ? parsed.pointsAOPS : parsed.pointsNIM;
                        rd = lbtype === 'AOPS' ? parsed.rdAOPS : parsed.rdNIM;
                    }
                    else {
                        pts = lbtype === 'AOPS' ? o.value.pointsAOPS : o.value.pointsNIM;
                        rd = lbtype === 'AOPS' ? o.value.rdAOPS : o.value.rdNIM;
                    }
                    userArray.push([o.id, pts,rd])
                }
            } else {
                const pts = lbtype === 'AOPS' ? o.value.pointsAOPS : o.value.pointsNIM;
                const rd = lbtype === 'AOPS' ? o.value.rdAOPS : o.value.rdNIM;
                userArray.push([o.id, pts, rd]);
            }
        }
        userArray.sort((a: [string, number,number], b: [string, number,number]) => {
            return b[1] - a[1];
        });

        return userArray;

    }

    private async fetchMarketLeaderboardData(interaction: ChatInputCommandInteraction): Promise<MarketLeaderboardRow[]> {
        const accounts = await listAccounts();
        const rows: MarketLeaderboardRow[] = [];

        for (const account of accounts) {
            if (!account.userId || account.userId === process.env.CLIENT_ID) continue;
            await ensureAccount(account.userId);
            const valuation = await markToMarket(account.userId, true);
            const initial = valuation.account.settings.initialCash ?? 0;
            const netWorth = valuation.netWorth;
            const pnl = netWorth - initial;
            rows.push({
                userId: account.userId,
                netWorth,
                pnl,
                twr: valuation.twr ?? 0,
            });
        }

        rows.sort((a, b) => b.pnl - a.pnl);
        return rows;
    }
}
