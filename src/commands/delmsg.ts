import { ChatInputCommandInteraction, Client, TextChannel, SlashCommandBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";

export default class delmsg implements IBotInteraction {
    name(): string {
        return "delmsg";
    }

    help(): string {
        return "Deletes the last message sent by the bot in the current channel.";
    }

    cooldown(): number {
        return 2;
    }

    isThisInteraction(command: string): boolean {
        return command === "delmsg";
    }

    data(): any {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help());
    }

    perms(): "admin" | "user" | "both" {
        return "user";
    }

    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        const channel = interaction.channel as TextChannel;

        try {
            // Fetch the last 50 messages in the channel
            const messages = await channel.messages.fetch({ limit: 50 });
        
            // Delete each message
            for (const message of messages.values()) {
                await message.delete();
            }
        
            // Optionally, reply to confirm the deletion
            // await interaction.reply({ content: "Successfully deleted the last 50 messages.", ephemeral: true });
        } catch (error) {
            console.error("Error deleting messages:", error);
            // Optionally, reply to indicate an error
            // await interaction.reply({ content: "An error occurred while trying to delete the messages.", ephemeral: true });
        }
        
    }
}
