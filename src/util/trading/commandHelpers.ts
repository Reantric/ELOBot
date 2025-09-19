import { ChatInputCommandInteraction } from 'discord.js';
import { AssetType, OptionRight } from './types.js';
import { OptionTradeRequest, TradeRequest } from './trades.js';

export function buildTradeRequest(
    interaction: ChatInputCommandInteraction,
    userId: string
): { request?: TradeRequest; error?: string } {
    const symbol = interaction.options.getString('symbol', true).toUpperCase();
    const assetType = interaction.options.getString('asset', true) as AssetType;
    const quantity = interaction.options.getInteger('quantity', true);
    const price = interaction.options.getNumber('price') ?? undefined;

    if (quantity <= 0) {
        return { error: 'Quantity must be a positive integer.' };
    }

    if (assetType === 'OPTION') {
        const expiration = interaction.options.getString('expiration');
        const strike = interaction.options.getNumber('strike');
        const right = interaction.options.getString('right') as OptionRight | null;
        if (!expiration || strike == null || !right) {
            return { error: 'Options trades require expiration, strike, and CALL/PUT selection.' };
        }
        const request: OptionTradeRequest = {
            assetType: 'OPTION',
            symbol,
            quantity,
            price,
            expiration,
            strike,
            right,
            userId,
        };
        return { request };
    }

    const request: TradeRequest = {
        assetType: 'EQUITY',
        symbol,
        quantity,
        price,
        userId,
    };
    return { request };
}
