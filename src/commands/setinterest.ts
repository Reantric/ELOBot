import { ChatInputCommandInteraction, Client, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { QuickDB } from "quick.db";
import { calculateAndApplyJtohInterest } from "../util/jtohInterest.js";

const db = new QuickDB();

export default class setinterest implements IBotInteraction {
    name(): string {
        return "setinterest";
    }

    help(): string {
        return "Set the JToH interest rate per second";
    }

    cooldown(): number {
        return 5;
    }

    isThisInteraction(command: string): boolean {
        return command === "setinterest";
    }

    data(): any {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help())
            .addNumberOption(option =>
                option
                    .setName('rate')
                    .setDescription('Interest rate per second (e.g., 0.000000116 for 1.16e-7)')
                    .setRequired(false)
            );
    }
    
    perms(): "admin" | "user" | "both" {
        return "both";
    }
    
    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        const newRate = interaction.options.getNumber('rate');
        
        if (interaction.user.id == '118663865264242688') {
            if (interaction.options.getNumber('rate') === null){
            interaction.reply({content: "You have no power here, Snowflake... Only the Amog may add and the Log may remove..."});
            return;
            }
        }
        if (interaction.user.id == '412937618695782420'){
            interaction.reply({content: "That's clever. Nice try."});
            return;
        }

        // If no rate provided, just show current rate
        if (newRate === null) {
            const currentRate = await db.get('jtoh.interest_rate') || 1.16 * Math.pow(10, -7);
            
            const embed = new EmbedBuilder()
                .setTitle('📊 Current Interest Rate')
                .setDescription('JToH current interest rate information.')
                .addFields(
                    {
                        name: 'Current Rate',
                        value: `${currentRate.toExponential(3)} per second`,
                        inline: false
                    }
                )
                .setColor('#0099FF')
                .setFooter({ text: 'Amog Federal Reserve' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }
        
        // Check if user is authorized for setting rates
        const authorizedUsers = ['1134353765240160346', '260118674306760705'];
        if (!authorizedUsers.includes(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Access Denied')
                .setDescription('You do not have permission to modify the interest rate.')
                .setColor('#FF6B6B')
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }
        
        // Validate the rate (should be a reasonable number)
        if (newRate < 0 || newRate > 0.01) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Invalid Rate')
                .setDescription('Interest rate must be between 0 and 0.01 (1%) per second.')
                .setColor('#FF6B6B')
                .setTimestamp()
                .setFooter({ text: 'Amog Federal Reserve' });
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        // Get current rate for comparison
        const currentRate = await db.get('jtoh.interest_rate') || 1.16 * Math.pow(10, -7);
        
        // IMPORTANT: Recalculate JToH time with current rate before changing it
        // This ensures time accumulated under the old rate gets properly calculated
        console.log(`[SETINTEREST] Applying interest with current rate before changing to new rate`);
        await calculateAndApplyJtohInterest();
        
        // NOW update the interest rate in database
        await db.set('jtoh.interest_rate', newRate);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Interest Rate Updated')
            .setDescription('JToH interest rate has been successfully updated.')
            .addFields(
                {
                    name: 'Previous Rate',
                    value: `${currentRate.toExponential(3)} per second`,
                    inline: true
                },
                {
                    name: 'New Rate',
                    value: `${newRate.toExponential(3)} per second`,
                    inline: true
                },
                {
                    name: 'Updated By',
                    value: `${interaction.user.username}`,
                    inline: true
                }
            )
            .setColor('#00D4AA')
            .setFooter({ text: 'Amog Federal Reserve' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
}
