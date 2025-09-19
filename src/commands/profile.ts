import { Client, ChatInputCommandInteraction, User } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { SlashCommandBuilder } from '@discordjs/builders';
import { QuickDB } from "quick.db";
import Titles from "../util/Titles.js";
import { markToMarket, PortfolioValuation } from '../util/trading/portfolio.js';
import { formatCurrency, formatNumber, formatPercentage } from '../util/trading/view.js';

const db = new QuickDB();

type Metrics = {
    sharpeRatio: number | null;
    volatility: number | null;
    bestDay: number | null;
    worstDay: number | null;
    maxDrawdown: number | null;
};

export default class profile implements IBotInteraction {

    name(): string {
        return "profile";
    }

    help(): string {
        return "View your net worth, AOPSelo, and trading stats";
    }

    cooldown(): number{
        return 2;
    }
    isThisInteraction(command: string): boolean {
        return command === "profile";
    }

    data(): any {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help())
            .addUserOption(option => option.setName('target').setDescription('Select a user'))
            .addBooleanOption(option => option
                .setName('detailed')
                .setDescription('Include extended trading performance metrics')
            );
    }
    perms(): "admin" | "user" | "both" {
        return 'both';
    }

    async runCommand(interaction: ChatInputCommandInteraction, _Bot: Client): Promise<void> {
        let user = interaction.options.getUser('target');
        if (!user) {
            user = interaction.user;
        }

        const detailed = interaction.options.getBoolean('detailed') ?? false;
        const valuation = await markToMarket(user.id, true);
        const embed = await this.buildProfileEmbed(user, valuation, detailed);

        await interaction.reply({
            content: `Here is ${user}'s profile`,
            embeds: [embed],
            ephemeral: false,
        });
    }

    private async buildProfileEmbed(user: User, valuation: PortfolioValuation, detailed: boolean): Promise<EmbedBuilder> {
        const [aopsElo, nimElo] = await Promise.all([
            db.get<number>(`${user.id}.pointsAOPS`),
            db.get<number>(`${user.id}.pointsNIM`),
        ]);

        const nimTitle = typeof nimElo === 'number' ? Titles.getTitle(nimElo) : ["Nil", 0x5865f2];

        const embed = new EmbedBuilder()
            .setTitle(`${user.username}'s Profile`)
            .setDescription(`Overview for ${user.username}`)
            .setColor(nimTitle[1] as any)
            .addFields(
                { name: 'Net Worth', value: formatCurrency(valuation.netWorth), inline: true },
                { name: 'AOPS Rating', value: aopsElo ? `**${Math.floor(aopsElo)}**` : 'N/A', inline: true },
            )
            .setTimestamp(new Date())
            .setFooter({ text: detailed ? 'Profile • detailed view' : 'Profile' });

        const avatar = user.avatarURL();
        if (avatar) {
            embed.setAuthor({ name: user.username, iconURL: avatar });
            embed.setThumbnail(avatar);
        } else {
            embed.setAuthor({ name: user.username });
        }

        if (!detailed) {
            embed.addFields({ name: 'Time-Weighted Return', value: this.formatSignedPercentage(valuation.twr), inline: true });
            return embed;
        }

        embed.addFields({ name: 'Title', value: `**${nimTitle[0]}**`, inline: true });

        const metrics = this.calculatePerformanceMetrics(valuation.account);
        const initial = valuation.account.settings.initialCash ?? 0;
        const totalReturn = initial > 0 ? (valuation.netWorth - initial) / initial : 0;
        const unrealized = valuation.unrealizedPnl ?? 0;
        const realized = valuation.realizedPnl ?? 0;
        const totalPnl = unrealized + realized;

        embed.addFields(
            { name: 'Cash', value: formatCurrency(valuation.cash), inline: true },
            { name: 'Positions Value', value: formatCurrency(valuation.positionsValue), inline: true },
            { name: 'Trades', value: `${valuation.account.tradeHistory.length}`, inline: true },
            { name: 'Realized P/L', value: this.formatSignedCurrency(realized), inline: true },
            { name: 'Unrealized P/L', value: this.formatSignedCurrency(unrealized), inline: true },
            { name: 'Total P/L', value: this.formatSignedCurrency(totalPnl), inline: true },
            { name: 'Total Return', value: this.formatSignedPercentage(totalReturn), inline: true },
            { name: 'Time-Weighted Return', value: this.formatSignedPercentage(valuation.twr), inline: true },
            { name: 'Sharpe Ratio', value: metrics.sharpeRatio != null ? formatNumber(metrics.sharpeRatio, 2) : 'N/A', inline: true },
            { name: 'Volatility (ann.)', value: metrics.volatility != null ? formatPercentage(metrics.volatility) : 'N/A', inline: true },
            { name: 'Best Day', value: metrics.bestDay != null ? this.formatSignedPercentage(metrics.bestDay) : 'N/A', inline: true },
            { name: 'Worst Day', value: metrics.worstDay != null ? this.formatSignedPercentage(metrics.worstDay) : 'N/A', inline: true },
            { name: 'Max Drawdown', value: metrics.maxDrawdown != null ? formatPercentage(metrics.maxDrawdown) : 'N/A', inline: true },
        );

        return embed;
    }

    private calculatePerformanceMetrics(account: PortfolioValuation['account']): Metrics {
        const history = account.netWorthHistory ?? [];
        if (history.length < 2) {
            return {
                sharpeRatio: null,
                volatility: null,
                bestDay: null,
                worstDay: null,
                maxDrawdown: null,
            };
        }

        const returns: number[] = [];
        for (let i = 1; i < history.length; i += 1) {
            const prev = history[i - 1];
            const curr = history[i];
            if (!prev.netWorth || prev.netWorth === 0) continue;
            const r = (curr.netWorth - prev.netWorth) / prev.netWorth;
            if (Number.isFinite(r)) returns.push(r);
        }

        if (returns.length === 0) {
            return {
                sharpeRatio: null,
                volatility: null,
                bestDay: null,
                worstDay: null,
                maxDrawdown: null,
            };
        }

        const riskFree = account.settings.riskFreeRate ?? 0;
        const rfDaily = riskFree / 252;
        const excessReturns = returns.map(r => r - rfDaily);
        const avgExcess = excessReturns.reduce((sum, r) => sum + r, 0) / excessReturns.length;
        const variance = excessReturns.reduce((sum, r) => sum + Math.pow(r - avgExcess, 2), 0) / (excessReturns.length - 1 || 1);
        const stdDev = Math.sqrt(Math.max(variance, 0));
        const sharpeRatio = stdDev > 0 ? (avgExcess / stdDev) * Math.sqrt(252) : null;
        const volatility = stdDev * Math.sqrt(252);
        const bestDay = returns.reduce((max, r) => Math.max(max, r), -Infinity);
        const worstDay = returns.reduce((min, r) => Math.min(min, r), Infinity);

        let peak = history[0].netWorth ?? 0;
        let maxDrawdown = 0;
        for (const point of history) {
            const netWorth = point.netWorth ?? 0;
            if (netWorth > peak) {
                peak = netWorth;
            }
            if (peak > 0) {
                const drawdown = 1 - netWorth / peak;
                if (drawdown > maxDrawdown) {
                    maxDrawdown = drawdown;
                }
            }
        }

        return {
            sharpeRatio,
            volatility,
            bestDay,
            worstDay,
            maxDrawdown,
        };
    }

    private formatSignedCurrency(value: number): string {
        if (!Number.isFinite(value)) return 'N/A';
        const absolute = formatCurrency(Math.abs(value));
        if (value > 0) return `+${absolute}`;
        if (value < 0) return `-${absolute}`;
        return absolute;
    }

    private formatSignedPercentage(value: number): string {
        if (!Number.isFinite(value)) return 'N/A';
        const absolute = formatPercentage(Math.abs(value));
        if (value > 0) return `+${absolute}`;
        if (value < 0) return `-${absolute}`;
        return absolute;
    }
}
