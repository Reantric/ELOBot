import { ChatInputCommandInteraction, Client, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { QuickDB } from "quick.db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { calculateAndApplyJtohInterest } from "../util/jtohInterest.js";

const db = new QuickDB();
const marketsTable = db.table('markets');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// User IDs
const LOG_ID = '1134353765240160346';
const AMOG_ID = '260118674306760705';

// DEBUG: Clear all existing markets to prevent collisions during development
/*(async () => {
    try {
        await marketsTable.deleteAll();
        console.log('[MARKET DEBUG] Cleared all existing markets');
    } catch (error) {
        console.log('[MARKET DEBUG] Error clearing markets (might be empty):', error);
    }
})(); */

// AI helper functions
async function generateMarketName(question: string): Promise<string> {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: "You create catchy, short market names (max 40 characters) for betting questions. Use relevant emojis. Return only the market name, no quotes or explanations."
        });

        const prompt = `Create a catchy market name for this betting question: "${question}"`;
        const result = await model.generateContent([prompt]);
        const response = await result.response;
        let marketName = response.text().trim();
        
        // Remove quotes if present
        marketName = marketName.replace(/['"]/g, '');
        
        // Truncate if too long
        if (marketName.length > 40) {
            marketName = marketName.substring(0, 37) + '...';
        }
        
        return marketName;
    } catch (error) {
        console.error("Error generating market name:", error);
        // Fallback to first few words of question
        return question.split(' ').slice(0, 4).join(' ') + (question.split(' ').length > 4 ? '...' : '');
    }
}

async function generateOutcomeExplanation(question: string, creatorSide: string, logWinAmount: number, amogWinAmount: number, creatorOdds: number, isLogCreator: boolean): Promise<string> {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: "You explain betting outcomes for a JToH time pool. LOG always wants to reduce time, AMOG always wants to increase time. Be clear and concise. Format: '• If [outcome]: JToH time [decreases/increases] by X minutes'"
        });

        // Determine who bets what
        const logPosition = isLogCreator ? creatorSide.toUpperCase() : (creatorSide === 'yes' ? 'NO' : 'YES');
        const amogPosition = isLogCreator ? (creatorSide === 'yes' ? 'NO' : 'YES') : creatorSide.toUpperCase();

        const prompt = `Question: "${question}"

Betting positions:
- LOG bets ${logPosition} (wants to REDUCE JToH time)
- AMOG bets ${amogPosition} (wants to INCREASE JToH time)

If LOG wins: JToH time DECREASES by ${logWinAmount} minutes
If AMOG wins: JToH time INCREASES by ${amogWinAmount} minutes

Explain the two possible outcomes clearly. Use this format:
• If [outcome that makes LOG win]: JToH time decreases by ${logWinAmount} minutes
• If [outcome that makes AMOG win]: JToH time increases by ${amogWinAmount} minutes`;

        const result = await model.generateContent([prompt]);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("Error generating outcome explanation:", error);
        // Fallback to simple explanation
        return `• If LOG wins: JToH time decreases by ${logWinAmount} minutes\n• If AMOG wins: JToH time increases by ${amogWinAmount} minutes`;
    }
}

export default class market implements IBotInteraction {
    name(): string {
        return "market";
    }

    help(): string {
        return "Create a betting market on JToH time";
    }

    cooldown(): number {
        return 10;
    }

    isThisInteraction(command: string): boolean {
        return command === "market";
    }

    data(): any {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help())
            .addStringOption(option =>
                option
                    .setName('question')
                    .setDescription('The question/event to bet on')
                    .setRequired(true)
            )
            .addNumberOption(option =>
                option
                    .setName('odds')
                    .setDescription('Probability of your chosen outcome (1-99%)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(99)
            )
            .addNumberOption(option =>
                option
                    .setName('amount')
                    .setDescription('Minutes to bet from JToH time pool')
                    .setRequired(true)
                    .setMinValue(1)
            )
            .addStringOption(option =>
                option
                    .setName('side')
                    .setDescription('Which outcome you are betting on')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Yes', value: 'yes' },
                        { name: 'No', value: 'no' }
                    )
            );
    }
    
    perms(): "admin" | "user" | "both" {
        return "both";
    }
    
    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        await interaction.deferReply();
        console.log(`[MARKET] New market creation attempt by ${interaction.user.username} (${interaction.user.id})`);
        
        // Only Log and Amog can create markets
        const authorizedUsers = [LOG_ID, AMOG_ID]; // LOG, AMOG
        if (!authorizedUsers.includes(interaction.user.id)) {
            console.log(`[MARKET] Access denied for unauthorized user: ${interaction.user.id}`);
            const embed = new EmbedBuilder()
                .setTitle('❌ Access Denied')
                .setDescription('Only Log and Amog can create betting markets.')
                .setColor('#FF6B6B')
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const question = interaction.options.getString('question', true);
        const odds = interaction.options.getNumber('odds', true);
        const amount = interaction.options.getNumber('amount', true);
        const side = interaction.options.getString('side', true);

        console.log(`[MARKET] Creating market: "${question}", odds: ${odds}%, amount: ${amount}, side: ${side}`);

        // Determine player roles - LOG always reduces time, Amog always increases
        const isLogCreator = interaction.user.id === LOG_ID;
        const creatorWantsToReduce = isLogCreator; // LOG always wants to reduce time
        
        console.log(`[MARKET] Creator: ${isLogCreator ? 'LOG' : 'AMOG'} (wants to ${creatorWantsToReduce ? 'REDUCE' : 'INCREASE'} JToH time)`);

        // Check if user has enough JToH time to bet (with interest applied)
        const currentJtohTime = await calculateAndApplyJtohInterest();
        
        console.log(`[MARKET] Current JToH time (with interest): ${currentJtohTime}, requested bet: ${amount}`);
        
        if (amount > currentJtohTime) {
            console.log(`[MARKET] Insufficient funds - rejecting bet`);
            const embed = new EmbedBuilder()
                .setTitle('❌ Insufficient Funds')
                .setDescription(`Cannot bet ${amount} minutes. Current JToH time: ${currentJtohTime.toFixed(2)} minutes.`)
                .setColor('#FF6B6B')
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Calculate opponent's required bet amount with proper odds logic
        // Person betting on higher probability outcome should bet more
        const opponentOdds = 100 - odds;
        
        // Fair bet calculation: opponent_amount / creator_amount = creator_odds / opponent_odds
        // So: opponent_amount = creator_amount * (creator_odds / opponent_odds)
        const rawOpponentAmount = (amount * opponentOdds) / odds; // Fixed: swapped odds in formula
        
        // Apply 20% house edge in favor of AMOG
        const opponentAmount = rawOpponentAmount * 0.8; // 20% reduction for Amog advantage
        const amogAdvantage = rawOpponentAmount - opponentAmount;

        console.log(`[MARKET] Creator bets: ${amount} minutes at ${odds}% odds`);
        console.log(`[MARKET] Raw opponent amount: ${rawOpponentAmount.toFixed(2)}, with Amog advantage: ${opponentAmount.toFixed(2)}`);
        console.log(`[MARKET] Amog advantage: ${amogAdvantage.toFixed(2)} minutes (20% house edge)`);
        
        // Determine what each outcome means for JToH time
        let logWinAmount, amogWinAmount;
        if (isLogCreator) {
            // LOG created the market
            if (side === 'yes') {
                // LOG bets YES wins → JToH time reduces by LOG's amount
                // If NO wins → JToH time increases by opponent's amount  
                logWinAmount = amount; // LOG wins, reduces time
                amogWinAmount = opponentAmount; // AMOG wins, increases time
            } else {
                // LOG bets NO wins → JToH time reduces by LOG's amount
                // If YES wins → JToH time increases by opponent's amount
                logWinAmount = amount; // LOG wins, reduces time
                amogWinAmount = opponentAmount; // AMOG wins, increases time
            }
        } else {
            // AMOG created the market
            if (side === 'yes') {
                // AMOG bets YES wins → JToH time increases by AMOG's amount
                // If NO wins → JToH time decreases by opponent's amount
                amogWinAmount = amount; // AMOG wins, increases time
                logWinAmount = opponentAmount; // LOG wins, reduces time
            } else {
                // AMOG bets NO wins → JToH time increases by AMOG's amount  
                // If YES wins → JToH time decreases by opponent's amount
                amogWinAmount = amount; // AMOG wins, increases time
                logWinAmount = opponentAmount; // LOG wins, reduces time
            }
        }
        
        console.log(`[MARKET] If LOG wins: JToH time DECREASES by ${logWinAmount} minutes`);
        console.log(`[MARKET] If AMOG wins: JToH time INCREASES by ${amogWinAmount} minutes`);

        // Generate AI market name and outcome explanation
        console.log(`[MARKET] Generating AI market name and explanation...`);
        const marketName = await generateMarketName(question);
        const outcomeExplanation = await generateOutcomeExplanation(question, side, logWinAmount, amogWinAmount, odds, isLogCreator);
        
        console.log(`[MARKET] Generated market name: "${marketName}"`);

        // Create market ID
        const marketId = `market_${Date.now()}_${interaction.user.id}`;
        console.log(`[MARKET] Created market ID: ${marketId}`);

        // Store market data in dedicated markets table as a single JSON object
        console.log(`[MARKET] Storing market data in database...`);
        const marketData = {
            question,
            market_name: marketName,
            creator: interaction.user.id,
            creator_side: side,
            creator_amount: amount,
            creator_odds: odds,
            opponent_amount: opponentAmount,
            amog_advantage: amogAdvantage,
            log_win_amount: logWinAmount,
            amog_win_amount: amogWinAmount,
            status: 'pending',
            created_at: new Date().toISOString()
        };
        
        await marketsTable.set(marketId, marketData);
        console.log(`[MARKET] Market data stored successfully`);

        // Determine the other player
        const otherPlayerId = authorizedUsers.find(id => id !== interaction.user.id);
        const otherPlayer = await Bot.users.fetch(otherPlayerId!);

        const creatorName = interaction.user.username;
        const opponentName = otherPlayer.username;
        const creatorSideText = side === 'yes' ? 'YES' : 'NO';
        const opponentSideText = side === 'yes' ? 'NO' : 'YES';

        // Create clear bet description
        const betDescription = isLogCreator 
            ? `${creatorName} (LOG) bets **${amount} minutes** on **${creatorSideText}** (${odds}% odds) to REDUCE JToH time\n${opponentName} (AMOG) must bet **${opponentAmount.toFixed(2)} minutes** on **${opponentSideText}** (${opponentOdds}% odds) to INCREASE JToH time`
            : `${creatorName} (AMOG) bets **${amount} minutes** on **${creatorSideText}** (${odds}% odds) to INCREASE JToH time\n${opponentName} (LOG) must bet **${opponentAmount.toFixed(2)} minutes** on **${opponentSideText}** (${opponentOdds}% odds) to REDUCE JToH time`;

        const embed = new EmbedBuilder()
            .setTitle(`${marketName}`)
            .setDescription(`**Question:** ${question}`)
            .addFields(
                {
                    name: 'Bet Details',
                    value: betDescription,
                    inline: false
                },
                {
                    name: 'Potential Outcomes',
                    value: outcomeExplanation,
                    inline: false
                },
                {
                    name: 'House Edge',
                    value: `20% advantage for the Amog (${amogAdvantage.toFixed(2)} minutes saved)`,
                    inline: true
                },
                {
                    name: 'Current JToH Time',
                    value: `${currentJtohTime.toFixed(2)} minutes`,
                    inline: true
                }
            )
            .setColor('#FFA500')
            .setFooter({ text: `Market ID: ${marketId} • Awaiting ${otherPlayer.username}'s response` })
            .setTimestamp();

        // Create buttons
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`accept_bet_${marketId}`)
                    .setLabel('✅ Accept Bet')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`decline_bet_${marketId}`)
                    .setLabel('❌ Decline Bet')
                    .setStyle(ButtonStyle.Danger)
            );

        await interaction.editReply({ 
            content: `${otherPlayer}, you have a new betting proposal!`,
            embeds: [embed], 
            components: [row] 
        });

        // Set up button interaction collector
        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // 5 minutes timeout
        });

        collector.on('collect', async (buttonInteraction) => {
            console.log(`[MARKET] Button interaction from ${buttonInteraction.user.username} (${buttonInteraction.user.id})`);
            
            // Check if it's the creator canceling their own market
            const isCreatorCanceling = buttonInteraction.user.id === interaction.user.id && buttonInteraction.customId.startsWith('decline_bet');
            
            if (!isCreatorCanceling && buttonInteraction.user.id !== otherPlayerId) {
                console.log(`[MARKET] Unauthorized button interaction - only ${otherPlayerId} or creator can respond`);
                await buttonInteraction.reply({ 
                    content: 'Only the challenged player or market creator can respond to this bet.',
                    ephemeral: true 
                });
                return;
            }

            const isAccepted = buttonInteraction.customId.startsWith('accept_bet');
            
            if (isCreatorCanceling) {
                console.log(`[MARKET] Market ${marketId} CANCELED by creator ${buttonInteraction.user.username}`);
                
                // Cancel the bet
                const marketData = await marketsTable.get(marketId);
                marketData.status = 'canceled';
                marketData.canceled_at = new Date().toISOString();
                marketData.canceled_by = buttonInteraction.user.id;
                await marketsTable.set(marketId, marketData);
                
                const cancelEmbed = new EmbedBuilder()
                    .setTitle('🚫 Market Canceled')
                    .setDescription(`${buttonInteraction.user.username} canceled their betting proposal.`)
                    .setColor('#808080')
                    .setFooter({ text: `Market ID: ${marketId} • Canceled by Creator` })
                    .setTimestamp();

                await buttonInteraction.update({ 
                    embeds: [cancelEmbed], 
                    components: [] 
                });
            } else {
                console.log(`[MARKET] Market ${marketId} ${isAccepted ? 'ACCEPTED' : 'DECLINED'} by ${buttonInteraction.user.username}`);
                
                if (isAccepted) {
                    // Accept the bet - put money in escrow and create active market
                    const marketData = await marketsTable.get(marketId);
                    marketData.status = 'active';
                    marketData.accepted_at = new Date().toISOString();
                    await marketsTable.set(marketId, marketData);
                    
                    console.log(`[MARKET] Market ${marketId} status updated to 'active'`);
                    
                    const successEmbed = new EmbedBuilder()
                        .setTitle(`✅ ${marketName} - Bet Accepted!`)
                        .setDescription(`**Question:** ${question}\n\nThe market is now active. Both players' stakes are in escrow.`)
                        .addFields(
                            {
                                name: 'Stakes',
                                value: `${creatorName}: ${amount} minutes on ${creatorSideText}\n${opponentName}: ${opponentAmount.toFixed(2)} minutes on ${opponentSideText}`,
                                inline: false
                            },
                            {
                                name: 'Resolution',
                                value: 'Either player can resolve this market when the outcome is known.',
                                inline: false
                            }
                        )
                        .setColor('#00D4AA')
                        .setFooter({ text: `Market ID: ${marketId} • Active Market` })
                        .setTimestamp();

                    await buttonInteraction.update({ 
                        embeds: [successEmbed], 
                        components: [] 
                    });
                } else {
                    // Decline the bet
                    const marketData = await marketsTable.get(marketId);
                    marketData.status = 'declined';
                    marketData.declined_at = new Date().toISOString();
                    marketData.declined_by = buttonInteraction.user.id;
                    await marketsTable.set(marketId, marketData);
                    
                    const declineEmbed = new EmbedBuilder()
                        .setTitle('❌ Bet Declined')
                        .setDescription(`${buttonInteraction.user.username} declined the betting proposal.`)
                        .setColor('#FF6B6B')
                        .setFooter({ text: `Market ID: ${marketId} • Declined` })
                        .setTimestamp();

                    await buttonInteraction.update({ 
                        embeds: [declineEmbed], 
                        components: [] 
                    });
                }
            }
            
            collector.stop();
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                console.log(`[MARKET] Market ${marketId} EXPIRED due to timeout`);
                // Timeout - mark as expired
                const marketData = await marketsTable.get(marketId);
                if (marketData) {
                    marketData.status = 'expired';
                    await marketsTable.set(marketId, marketData);
                }
                
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏰ Bet Expired')
                    .setDescription('The betting proposal has expired due to no response.')
                    .setColor('#808080')
                    .setFooter({ text: `Market ID: ${marketId} • Expired` })
                    .setTimestamp();

                await interaction.editReply({ 
                    embeds: [timeoutEmbed], 
                    components: [] 
                });
            }
        });
    }
}
