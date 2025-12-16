import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, Client, EmbedBuilder } from 'discord.js';
import { IBotInteraction } from '../api/capi';
import { getOptionChain, getQuote } from '../util/trading/marketData.js';
import { OptionContractQuote } from '../util/trading/types.js';
import { formatCurrency, formatNumber, formatPercentage } from '../util/trading/view.js';

export default class Chain implements IBotInteraction {
    name(): string {
        return 'chain';
    }

    help(): string {
        return 'Display a snapshot of the options chain';
    }

    cooldown(): number {
        return 5;
    }

    perms(): 'admin' | 'user' | 'both' {
        return 'both';
    }

    isThisInteraction(command: string): boolean {
        return command === this.name();
    }

    data(): any {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help())
            .addStringOption(option => option.setName('symbol').setDescription('Underlying symbol').setRequired(true))
            .addStringOption(option => option.setName('expiration').setDescription('Expiration YYYY-MM-DD'))
            .addStringOption(option => option
                .setName('type')
                .setDescription('Call or Put focus')
                .addChoices(
                    { name: 'Calls', value: 'CALLS' },
                    { name: 'Puts', value: 'PUTS' },
                    { name: 'Both', value: 'BOTH' },
                ))
            .addIntegerOption(option => option
                .setName('count')
                .setDescription('How many strikes to show around spot')
                .setMinValue(3)
                .setMaxValue(20));
    }

    async runCommand(interaction: ChatInputCommandInteraction, _Bot: Client): Promise<void> {
        await interaction.deferReply();

        try {
            const symbol = interaction.options.getString('symbol', true).toUpperCase();
            const expiration = interaction.options.getString('expiration') ?? undefined;
            const type = interaction.options.getString('type') ?? 'BOTH';
            const count = interaction.options.getInteger('count') ?? 8;

            const [quote, chain] = await Promise.all([
                getQuote(symbol),
                getOptionChain(symbol, expiration),
            ]);

            const targetExpiration = expiration ?? chain.expirationDates[0];
            const embed = new EmbedBuilder()
                .setTitle(`${symbol} Options ${targetExpiration}`)
                .setColor(0xf1c40f)
                .setFooter({ text: `Underlying ${formatCurrency(quote.price)}` });

            const strikes = this.pickStrikes(chain.calls, chain.puts, quote.price, count);

            if (type === 'CALLS' || type === 'BOTH') {
                embed.addFields({ name: 'Calls', value: this.renderSide(strikes.calls, 'CALL'), inline: false });
            }
            if (type === 'PUTS' || type === 'BOTH') {
                embed.addFields({ name: 'Puts', value: this.renderSide(strikes.puts, 'PUT'), inline: false });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error: any) {
            await interaction.editReply({ content: `❌ Failed to pull chain: ${error.message ?? error}` });
        }
    }

    private pickStrikes(calls: OptionContractQuote[], puts: OptionContractQuote[], spot: number, count: number) {
        const sortedCalls = [...calls].sort((a, b) => a.strike - b.strike);
        const sortedPuts = [...puts].sort((a, b) => a.strike - b.strike);
        const reference = sortedCalls.length > 0 ? sortedCalls : sortedPuts;
        if (reference.length === 0) {
            return { calls: [], puts: [] };
        }

        const closestIndex = reference.reduce((best, contract, idx) => {
            const currentDiff = Math.abs(contract.strike - spot);
            const bestDiff = Math.abs(reference[best].strike - spot);
            return currentDiff < bestDiff ? idx : best;
        }, 0);
        const half = Math.floor(count / 2);
        const start = Math.max(0, closestIndex - half);
        const end = Math.min(reference.length, start + count);
        const selectionCalls = sortedCalls.slice(start, end);
        const selectionPuts = sortedPuts.slice(start, end);
        return { calls: selectionCalls, puts: selectionPuts };
    }

    private renderSide(contracts: OptionContractQuote[], _label: 'CALL' | 'PUT'): string {
        if (contracts.length === 0) {
            return '`no contracts in range`';
        }
        const rows = contracts.map(contract => {
            const iv = contract.impliedVolatility ?? 0;
            const bid = formatCurrency(contract.bid ?? 0);
            const ask = formatCurrency(contract.ask ?? 0);
            const mid = formatCurrency(contract.midpoint ?? contract.lastPrice ?? 0);
            return `**${formatNumber(contract.strike, 2)}** • B:${bid} A:${ask} M:${mid} • IV ${formatPercentage(iv)}`;
        });
        return rows.slice(0, 20).join('\n');
    }
}
