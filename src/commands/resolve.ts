import { ChatInputCommandInteraction, Client, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { QuickDB } from "quick.db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { calculateAndApplyJtohInterest, setJtohTime } from "../util/jtohInterest.js";

const db = new QuickDB();
const marketsTable = db.table('markets');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// User IDs
const LOG_ID = '1134353765240160346';
const AMOG_ID = '260118674306760705';

interface MarketData {
    id: string;
    question: string;
    market_name: string;
    creator: string;
    creator_side: string;
    creator_amount: number;
    creator_odds: number;
    opponent_amount: number;
    amog_advantage: number;
    log_win_amount: number;
    amog_win_amount: number;
    status: string;
    created_at: string;
    accepted_at?: string;
}

// AI helper function to resolve markets
async function resolveMarketWithAI(resolutionText: string, activeMarkets: MarketData[], resolverId: string): Promise<{
    marketId: string | null;
    outcome: 'yes' | 'no' | null;
    explanation: string;
    confidence: number;
}> {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: `You are a market resolution AI. Your job is to:
1. Match user-provided resolution text to the correct active betting market
2. Determine if the outcome is YES or NO based on the market question
3. Provide a confidence score (0-100) and clear explanation

Return JSON format:
{
  "marketId": "market_id_here_or_null",
  "outcome": "yes_or_no_or_null", 
  "explanation": "clear_explanation_here",
  "confidence": confidence_score_0_to_100
}

If no clear match or outcome can be determined, set marketId and outcome to null and explain why.`
        });

        const resolverName = resolverId === LOG_ID ? 'LOG' : 'AMOG';
        
        const marketsContext = activeMarkets.map(market => {
            const creatorName = market.creator === LOG_ID ? 'LOG' : 'AMOG';
            const opponentName = market.creator === LOG_ID ? 'AMOG' : 'LOG';
            
            return `Market ID: ${market.id}
Question: ${market.question}
Market Name: ${market.market_name}
Creator: ${creatorName} betting ${market.creator_side.toUpperCase()}
Opponent: ${opponentName} betting ${market.creator_side === 'yes' ? 'NO' : 'YES'}
Created: ${market.created_at}`;
        }).join('\n\n');

        const prompt = `Resolution text: "${resolutionText}"
Resolver: ${resolverName} (the person providing this resolution)

Active Markets:
${marketsContext}

Please match this resolution to the correct market and determine the YES/NO outcome. Consider:
- Keywords and context in the resolution text
- The market questions and names
- Timing relevance
- Clear logical connection between resolution and market question
- Personal pronouns ("I win/lose") refer to the resolver (${resolverName})

Return only valid JSON with no additional text.`;

        const result = await model.generateContent([prompt]);
        const response = await result.response;
        let jsonText = response.text().trim();
        
        console.log(`[RESOLVE] AI Raw Response: ${jsonText}`);
        
        // Clean up the response - remove markdown code blocks if present
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }
        
        console.log(`[RESOLVE] Cleaned JSON: ${jsonText}`);
        
        // Parse JSON response
        const parsed = JSON.parse(jsonText);
        
        return {
            marketId: parsed.marketId,
            outcome: parsed.outcome,
            explanation: parsed.explanation || "No explanation provided",
            confidence: parsed.confidence || 0
        };
    } catch (error) {
        console.error("[RESOLVE] AI Resolution Error:", error);
        return {
            marketId: null,
            outcome: null,
            explanation: "I had a brain fart, sorry.",
            confidence: 0
        };
    }
}

export default class resolve implements IBotInteraction {
    name(): string {
        return "resolve";
    }

    help(): string {
        return "Resolve an active betting market using Tearfox's Quantum Harmonic Oscillator.";
    }

    cooldown(): number {
        return 5;
    }

    isThisInteraction(command: string): boolean {
        return command === "resolve";
    }

    data(): any {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help())
            .addStringOption(option =>
                option
                    .setName('resolution')
                    .setDescription('Description of what happened to resolve the market')
                    .setRequired(true)
            );
    }
    
    perms(): "admin" | "user" | "both" {
        return "both";
    }
    
    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        await interaction.deferReply();
        console.log(`[RESOLVE] Resolution attempt by ${interaction.user.username} (${interaction.user.id})`);
        
        // Only Log and Amog can resolve markets
        const authorizedUsers = [LOG_ID, AMOG_ID]; // LOG, AMOG
        if (!authorizedUsers.includes(interaction.user.id)) {
            console.log(`[RESOLVE] Access denied for unauthorized user: ${interaction.user.id}`);
            const embed = new EmbedBuilder()
                .setTitle('❌ Access Denied')
                .setDescription('Only Log and Amog can resolve betting markets.')
                .setColor('#FF6B6B')
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const resolutionText = interaction.options.getString('resolution', true);
        console.log(`[RESOLVE] Resolution text: "${resolutionText}"`);

        // Fetch all active markets from database
        console.log(`[RESOLVE] Fetching all active markets from database...`);
        const allMarkets = await marketsTable.all();
        
        // Parse markets - QuickDB stores each market as a single JSON object
        const activeMarkets: MarketData[] = allMarkets
            .filter(item => {
                // Check if the value is an object with status 'active'
                return typeof item.value === 'object' && item.value !== null && item.value.status === 'active';
            })
            .map(item => ({
                id: item.id,
                question: item.value.question,
                market_name: item.value.market_name,
                creator: item.value.creator,
                creator_side: item.value.creator_side,
                creator_amount: item.value.creator_amount,
                creator_odds: item.value.creator_odds,
                opponent_amount: item.value.opponent_amount,
                amog_advantage: item.value.amog_advantage,
                log_win_amount: item.value.log_win_amount,
                amog_win_amount: item.value.amog_win_amount,
                status: item.value.status,
                created_at: item.value.created_at,
                accepted_at: item.value.accepted_at
            }));

        console.log(`[RESOLVE] Found ${activeMarkets.length} active markets:`);
        activeMarkets.forEach((market, index) => {
            console.log(`[RESOLVE] ${index + 1}. ${market.market_name} (${market.id})`);
            console.log(`[RESOLVE]    Question: ${market.question}`);
            console.log(`[RESOLVE]    Creator: ${market.creator === LOG_ID ? 'LOG' : 'AMOG'} betting ${market.creator_side.toUpperCase()}`);
            console.log(`[RESOLVE]    Stakes: Creator ${market.creator_amount}min, Opponent ${market.opponent_amount}min`);
            console.log(`[RESOLVE]    Created: ${market.created_at}`);
        });

        if (activeMarkets.length === 0) {
            console.log(`[RESOLVE] No active markets found`);
            const embed = new EmbedBuilder()
                .setTitle('📭 No Active Markets')
                .setDescription('There are no active betting markets to resolve.')
                .setColor('#FFA500')
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Use AI to match resolution text to market and determine outcome
        console.log(`[RESOLVE] Sending to AI for semantic matching and outcome determination...`);
        const aiResult = await resolveMarketWithAI(resolutionText, activeMarkets, interaction.user.id);
        
        console.log(`[RESOLVE] AI Result:`, aiResult);
        
        if (!aiResult.marketId || !aiResult.outcome || aiResult.confidence < 70) {
            console.log(`[RESOLVE] AI could not confidently resolve market (confidence: ${aiResult.confidence}%)`);
            
            const marketsList = activeMarkets.map((market, index) => 
                `${index + 1}. **${market.market_name}**\n   *${market.question}*`
            ).join('\n\n');
            
            const embed = new EmbedBuilder()
                .setTitle('❓ Resolution Unclear')
                .setDescription(`I could not confidently match your resolution to a market.\n\n**Confidence:** ${aiResult.confidence}%\n**Explanation:** ${aiResult.explanation}`)
                .addFields({
                    name: '📋 Active Markets',
                    value: marketsList || 'None',
                    inline: false
                })
                .setColor('#FFA500')
                .setFooter({ text: 'Please provide more specific resolution details or use market names/keywords' })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Find the matched market
        const resolvedMarket = activeMarkets.find(market => market.id === aiResult.marketId);
        if (!resolvedMarket) {
            console.log(`[RESOLVE] AI returned invalid market ID: ${aiResult.marketId}`);
            await interaction.editReply({ 
                content: 'Error: AI returned an invalid market ID. Please try again.'
            });
            return;
        }

        console.log(`[RESOLVE] Successfully matched to market: ${resolvedMarket.market_name} (${resolvedMarket.id})`);
        console.log(`[RESOLVE] AI determined outcome: ${aiResult.outcome.toUpperCase()} (confidence: ${aiResult.confidence}%)`);

        // Determine who wins based on outcome and creator's bet
        const creatorBetSide = resolvedMarket.creator_side; // 'yes' or 'no'
        const outcomeMatches = creatorBetSide === aiResult.outcome;
        const creatorWins = outcomeMatches;
        
        const isCreatorLog = resolvedMarket.creator === LOG_ID;
        
        let winner: 'LOG' | 'AMOG';
        let jtohTimeChange: number;
        
        if (creatorWins) {
            winner = isCreatorLog ? 'LOG' : 'AMOG';
            jtohTimeChange = isCreatorLog ? -resolvedMarket.log_win_amount : resolvedMarket.amog_win_amount;
        } else {
            winner = isCreatorLog ? 'AMOG' : 'LOG';
            jtohTimeChange = isCreatorLog ? resolvedMarket.amog_win_amount : -resolvedMarket.log_win_amount;
        }

        console.log(`[RESOLVE] Resolution details:`);
        console.log(`[RESOLVE] Creator (${isCreatorLog ? 'LOG' : 'AMOG'}) bet ${creatorBetSide.toUpperCase()}, outcome was ${aiResult.outcome.toUpperCase()}`);
        console.log(`[RESOLVE] Creator wins: ${creatorWins}`);
        console.log(`[RESOLVE] Final winner: ${winner}`);
        console.log(`[RESOLVE] JToH time change: ${jtohTimeChange > 0 ? '+' : ''}${jtohTimeChange} minutes`);

        // Apply the JToH time change
        const currentJtohTime = await calculateAndApplyJtohInterest();
        const newJtohTime = Math.max(0, currentJtohTime + jtohTimeChange); // Prevent negative time
        await setJtohTime(newJtohTime);
        
        console.log(`[RESOLVE] JToH time updated: ${currentJtohTime.toFixed(2)} → ${newJtohTime.toFixed(2)} minutes`);

        // Mark market as resolved by updating the JSON object
        const marketData = await marketsTable.get(resolvedMarket.id);
        marketData.status = 'resolved';
        marketData.resolved_at = new Date().toISOString();
        marketData.resolved_by = interaction.user.id;
        marketData.resolution_text = resolutionText;
        marketData.outcome = aiResult.outcome;
        marketData.winner = winner;
        marketData.jtoh_time_change = jtohTimeChange;
        marketData.ai_confidence = aiResult.confidence;
        await marketsTable.set(resolvedMarket.id, marketData);

        console.log(`[RESOLVE] Market ${resolvedMarket.id} marked as resolved in database`);

        // Create resolution embed
        const creatorUser = await Bot.users.fetch(resolvedMarket.creator);
        const resolverUser = interaction.user;
        
        const embed = new EmbedBuilder()
            .setTitle(`✅ ${resolvedMarket.market_name} - RESOLVED`)
            .setDescription(`**Question:** ${resolvedMarket.question}\n**Resolution:** ${resolutionText}`)
            .addFields(
                {
                    name: '🎯 Outcome',
                    value: `**${aiResult.outcome.toUpperCase()}** (${aiResult.confidence}% confidence)\n`,//${aiResult.explanation}`,
                    inline: false
                },
                {
                    name: '🏆 Winner',
                    value: `**${winner}** wins the bet!`,
                    inline: true
                },
                {
                    name: '⏱️ JToH Time Impact',
                    value: `${jtohTimeChange > 0 ? '+' : ''}${jtohTimeChange} minutes\n${currentJtohTime.toFixed(2)} → ${newJtohTime.toFixed(2)} minutes`,
                    inline: true
                },
                {
                    name: '💰 Stakes',
                    value: `${creatorUser.username}: ${resolvedMarket.creator_amount} min (${creatorBetSide.toUpperCase()})\nOpponent: ${resolvedMarket.opponent_amount.toFixed(2)} min (${creatorBetSide === 'yes' ? 'NO' : 'YES'})`,
                    inline: false
                }
            )
            .setColor(winner === 'LOG' ? '#00D4AA' : '#FF6B6B')
            .setFooter({ 
                text: `Market ID: ${resolvedMarket.id} • Resolved by ${resolverUser.username}` 
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        
        console.log(`[RESOLVE] Resolution completed successfully for market ${resolvedMarket.id}`);
    }
}
