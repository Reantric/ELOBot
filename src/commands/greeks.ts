import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, Client, EmbedBuilder } from 'discord.js';
import { IBotInteraction } from '../api/capi';
import { getOptionChain, getQuote, getRiskFreeRate } from '../util/trading/marketData.js';
import { bsGreeks, bsPrice, impliedVol } from '../util/trading/pricing.js';
import { formatCurrency, formatNumber, formatPercentage } from '../util/trading/view.js';
import { timeToExpiry } from '../util/trading/time.js';

export default class Greeks implements IBotInteraction {
    name(): string {
        return 'greeks';
    }

    help(): string {
        return 'Compute Black-Scholes greeks for an option contract';
    }

    cooldown(): number {
        return 3;
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
            .addStringOption(option => option.setName('expiration').setDescription('Option expiration YYYY-MM-DD').setRequired(true))
            .addNumberOption(option => option.setName('strike').setDescription('Option strike price').setRequired(true))
            .addStringOption(option => option
                .setName('right')
                .setDescription('CALL or PUT')
                .addChoices(
                    { name: 'Call', value: 'CALL' },
                    { name: 'Put', value: 'PUT' },
                )
                .setRequired(true))
            .addNumberOption(option => option.setName('price').setDescription('Override option price'))
            .addNumberOption(option => option.setName('vol').setDescription('Override implied volatility (e.g., 0.25)'));
    }

    async runCommand(interaction: ChatInputCommandInteraction, _Bot: Client): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        try {
            const symbol = interaction.options.getString('symbol', true).toUpperCase();
            const expiration = interaction.options.getString('expiration', true);
            const strike = interaction.options.getNumber('strike', true);
            const right = interaction.options.getString('right', true) as 'CALL' | 'PUT';
            const priceOverride = interaction.options.getNumber('price') ?? undefined;
            const volOverride = interaction.options.getNumber('vol') ?? undefined;

            const [quote, chain, riskFree] = await Promise.all([
                getQuote(symbol),
                getOptionChain(symbol, expiration),
                getRiskFreeRate(),
            ]);

            const isCall = right === 'CALL';
            const bucket = isCall ? chain.calls : chain.puts;
            const contract = bucket.find(item => Math.abs(item.strike - strike) < 1e-6);
            if (!contract) {
                throw new Error('Option contract not found; use /chain to inspect available strikes');
            }

            const T = timeToExpiry(expiration);

            const price = priceOverride ?? contract.midpoint ?? contract.lastPrice ?? contract.bid ?? contract.ask;
            if (price == null) {
                throw new Error('Cannot determine price for contract; specify price or try later');
            }

            let sigma = volOverride ?? contract.impliedVolatility;
            if ((!sigma || sigma <= 0) && price > 0) {
                sigma = impliedVol(quote.price, strike, riskFree, T, isCall, price);
            }
            if (!sigma || !Number.isFinite(sigma)) {
                sigma = 0.3;
            }

            const greeks = bsGreeks(quote.price, strike, riskFree, sigma, T, isCall);
            const theo = bsPrice(quote.price, strike, riskFree, sigma, T, isCall);

            const embed = new EmbedBuilder()
                .setTitle(`${symbol} ${expiration} ${right} ${formatNumber(strike, 2)} Greeks`)
                .setColor(0x34495e)
                .addFields(
                    { name: 'Underlying', value: formatCurrency(quote.price), inline: true },
                    { name: 'Risk-Free', value: formatPercentage(riskFree), inline: true },
                    { name: 'Time to Expiry', value: `${formatNumber(T * 365, 1)} days`, inline: true },
                )
                .addFields(
                    { name: 'Price Used', value: formatCurrency(price), inline: true },
                    { name: 'Implied Vol', value: formatPercentage(sigma), inline: true },
                    { name: 'BS Theoretical', value: formatCurrency(theo), inline: true },
                )
                .addFields(
                    { name: 'Delta', value: formatNumber(greeks.delta, 3), inline: true },
                    { name: 'Gamma', value: formatNumber(greeks.gamma, 4), inline: true },
                    { name: 'Vega', value: formatNumber(greeks.vega, 2), inline: true },
                    { name: 'Theta', value: formatNumber(greeks.theta, 2), inline: true },
                    { name: 'Rho', value: formatNumber(greeks.rho, 2), inline: true },
                );

            await interaction.editReply({ embeds: [embed] });
        } catch (error: any) {
            await interaction.editReply({ content: `❌ Failed to compute greeks: ${error.message ?? error}` });
        }
    }
}
