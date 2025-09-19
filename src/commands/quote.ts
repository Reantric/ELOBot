import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, Client, EmbedBuilder } from 'discord.js';
import { IBotInteraction } from '../api/capi';
import { getQuote, getOptionChain, getRiskFreeRate } from '../util/trading/marketData.js';
import { bsGreeks, bsPrice, impliedVol } from '../util/trading/pricing.js';
import { formatCurrency, formatNumber, formatPercentage, formatTimestamp } from '../util/trading/view.js';
import { timeToExpiry } from '../util/trading/time.js';

export default class Quote implements IBotInteraction {
    name(): string {
        return 'quote';
    }

    help(): string {
        return 'Get the latest quote for a stock or option';
    }

    cooldown(): number {
        return 2;
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
            .addStringOption(option => option.setName('symbol').setDescription('Ticker symbol').setRequired(true))
            .addStringOption(option => option.setName('expiration').setDescription('Option expiration YYYY-MM-DD'))
            .addNumberOption(option => option.setName('strike').setDescription('Option strike price'))
            .addStringOption(option => option
                .setName('right')
                .setDescription('Option type CALL/PUT')
                .addChoices(
                    { name: 'Call', value: 'CALL' },
                    { name: 'Put', value: 'PUT' },
                ));
    }

    async runCommand(interaction: ChatInputCommandInteraction, _Bot: Client): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        try {
            const symbol = interaction.options.getString('symbol', true).toUpperCase();
            const expiration = interaction.options.getString('expiration');
            const strike = interaction.options.getNumber('strike');
            const right = interaction.options.getString('right') as 'CALL' | 'PUT' | null;

            if (expiration && strike != null && right) {
                const embed = await this.optionQuote(symbol, expiration, strike, right);
                await interaction.editReply({ embeds: [embed] });
            } else {
                const embed = await this.equityQuote(symbol);
                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error: any) {
            await interaction.editReply({ content: `❌ Failed to fetch quote: ${error.message ?? error}` });
        }
    }

    private async equityQuote(symbol: string): Promise<EmbedBuilder> {
        const quote = await getQuote(symbol);
        const embed = new EmbedBuilder()
            .setTitle(`${symbol} Quote`)
            .setColor(0x3498db)
            .addFields(
                { name: 'Price', value: formatCurrency(quote.price), inline: true },
                { name: 'Change', value: `${formatCurrency(quote.change ?? 0)} (${formatPercentage((quote.changePercent ?? 0) / 100)})`, inline: true },
                { name: 'Prev Close', value: formatCurrency(quote.previousClose ?? 0), inline: true },
            )
            .setFooter({ text: `Market time ${formatTimestamp(quote.regularMarketTime)}` });
        return embed;
    }

    private async optionQuote(symbol: string, expiration: string, strike: number, right: 'CALL' | 'PUT'): Promise<EmbedBuilder> {
        const [underlying, chain, riskFree] = await Promise.all([
            getQuote(symbol),
            getOptionChain(symbol, expiration),
            getRiskFreeRate(),
        ]);
        const bucket = right === 'CALL' ? chain.calls : chain.puts;
        const contract = bucket.find(item => Math.abs(item.strike - strike) < 1e-6);
        if (!contract) {
            throw new Error('Option contract not found; use /chain to inspect available strikes');
        }

        const mid = contract.midpoint ?? contract.lastPrice ?? contract.bid ?? contract.ask ?? 0;
        const T = timeToExpiry(expiration);
        const isCall = right === 'CALL';
        let iv = contract.impliedVolatility;
        if ((!iv || iv <= 0) && mid > 0) {
            iv = impliedVol(underlying.price, strike, riskFree, T, isCall, mid);
        }
        if (!iv || !Number.isFinite(iv)) {
            iv = 0.3;
        }
        const theo = bsPrice(underlying.price, strike, riskFree, iv, T, isCall);
        const greeks = bsGreeks(underlying.price, strike, riskFree, iv, T, isCall);

        const embed = new EmbedBuilder()
            .setTitle(`${symbol} ${expiration} ${right} ${formatNumber(strike, 2)} Quote`)
            .setColor(0x9b59b6)
            .setFooter({ text: `Underlying ${formatCurrency(underlying.price)} • Market time ${formatTimestamp(underlying.regularMarketTime)}` })
            .addFields(
                { name: 'Bid / Ask', value: `${formatCurrency(contract.bid ?? 0)} / ${formatCurrency(contract.ask ?? 0)}`, inline: true },
                { name: 'Mid', value: formatCurrency(mid), inline: true },
                { name: 'Last', value: formatCurrency(contract.lastPrice ?? 0), inline: true },
                { name: 'Implied Vol', value: formatPercentage(iv), inline: true },
                { name: 'Theo (BS)', value: formatCurrency(theo), inline: true },
                { name: 'Open Interest', value: `${contract.openInterest ?? 0}`, inline: true },
                { name: 'Delta', value: formatNumber(greeks.delta, 3), inline: true },
                { name: 'Gamma', value: formatNumber(greeks.gamma, 4), inline: true },
                { name: 'Vega', value: formatNumber(greeks.vega, 2), inline: true },
                { name: 'Theta', value: formatNumber(greeks.theta, 2), inline: true },
                { name: 'Rho', value: formatNumber(greeks.rho, 2), inline: true },
            );

        return embed;
    }
}
