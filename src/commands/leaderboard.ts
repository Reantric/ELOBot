import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, Client, EmbedBuilder } from 'discord.js';
import { IBotInteraction } from "../api/capi";
import { listAccounts } from '../util/trading/dataStore.js';
import { formatCurrency, formatPercentage } from '../util/trading/view.js';

interface LeaderboardEntry {
    userId: string;
    netWorth: number;
    twr: number;
    updatedAt: number;
}

export default class Leaderboard implements IBotInteraction {
    name(): string {
        return 'leaderboard';
    }

    help(): string {
        return 'Leaderboard ranked by total trading net worth';
    }

    cooldown(): number {
        return 30;
    }

    perms(): 'admin' | 'user' | 'both' {
        return 'both';
    }

    isThisInteraction(command: string): boolean {
        return command === this.name();
    }

    data(): any {
        return new SlashCommandBuilder().setName(this.name()).setDescription(this.help());
    }

    async runCommand(interaction: ChatInputCommandInteraction, _Bot: Client): Promise<void> {
        await interaction.deferReply({ ephemeral: false });
        try {
            const entries = await this.buildLeaderboard(interaction);
            const embed = this.renderEmbed(interaction, entries);
            await interaction.editReply({ embeds: [embed] });
        } catch (error: any) {
            await interaction.editReply({ content: `❌ Failed to build leaderboard: ${error.message ?? error}` });
        }
    }

    private async buildLeaderboard(interaction: ChatInputCommandInteraction): Promise<LeaderboardEntry[]> {
        const accounts = await listAccounts();
        const entries: LeaderboardEntry[] = accounts.map(account => {
            const latest = account.netWorthHistory.length > 0
                ? account.netWorthHistory[account.netWorthHistory.length - 1]
                : undefined;
            const netWorth = latest?.netWorth ?? account.cash;
            const updatedAt = latest?.timestamp ?? account.lastMark ?? Date.now();
            return {
                userId: account.userId,
                netWorth,
                twr: account.twr ?? latest?.twr ?? 0,
                updatedAt,
            };
        });

        return entries
            .filter(entry => Number.isFinite(entry.netWorth))
            .sort((a, b) => b.netWorth - a.netWorth)
            .slice(0, 15);
    }

    private renderEmbed(interaction: ChatInputCommandInteraction, entries: LeaderboardEntry[]): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setTitle('Paper Trading Leaderboard')
            .setColor(0x8e44ad)
            .setTimestamp(new Date())
            .setFooter({ text: `Requested by ${interaction.user.username}` });

        if (entries.length === 0) {
            embed.setDescription('No accounts found yet. Run /buy or /sell to create your account.');
            return embed;
        }

        const lines = entries.map((entry, index) => {
            const rank = index + 1;
            const member = interaction.guild?.members.cache.get(entry.userId)?.displayName
                ?? interaction.client.users.cache.get(entry.userId)?.username
                ?? entry.userId;
            return `**#${rank}** ${member} • Net ${formatCurrency(entry.netWorth)} • TWR ${formatPercentage(entry.twr)}`;
        });

        embed.setDescription(lines.join('\n'));
        return embed;
    }
}
