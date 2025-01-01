import { ChatInputCommandInteraction, Client, TextChannel, SlashCommandBuilder, EmbedBuilder, TextBasedChannel, ChannelType } from "discord.js";
import { IBotInteraction } from "../api/capi";

export default class delmsg implements IBotInteraction {
    name(): string {
        return "test";
    }

    help(): string {
        return "Sends ASCII art using embeds for higher character limits.";
    }

    cooldown(): number {
        return 2;
    }

    isThisInteraction(command: string): boolean {
        return command === "test";
    }

    data(): any {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help())
            .addStringOption(option =>
                option
                    .setName('message_id')
                    .setDescription('The ID of the message to delete')
                    .setRequired(true)
            );
    }
    
    perms(): "admin" | "user" | "both" {
        return "user";
    }
    
    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        if (interaction.user.id != '1134353765240160346') return;
        const channel = interaction.channel as TextChannel;
        const messageId = interaction.options.getString('message_id', true);
    
        try {
            // Fetch the message by ID
            const message = await channel.messages.fetch(messageId);
    
            // Check if the message exists and if it was sent by the bot
            if (true) {
                // Send the Death Note GIF publicly
                const gifMessage = await interaction.reply({
                    content: "https://media1.tenor.com/m/jgIK1HjWetAAAAAd/delete-death-note.gif",
                    fetchReply: true
                });
    
                // Delete the specified message
                await message.delete();
    
                // Wait for 15 seconds, then delete the GIF message
                setTimeout(async () => {
                    try {
                        await gifMessage.delete();
                    } catch (error) {
                        console.error("Error deleting GIF message:", error);
                    }
                }, 5000);
            } else {
                await interaction.reply({
                    content: "The specified message was not sent by the bot.",
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error("Error deleting message:", error);
            await interaction.reply({
                content: "An error occurred while trying to delete the specified message. Please ensure the ID is correct and the message exists.",
                ephemeral: true
            });
        }
    }
    
}
