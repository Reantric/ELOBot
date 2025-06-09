import { Client, ChatInputCommandInteraction, SlashCommandBuilder, TextChannel, Guild, AttachmentBuilder, MessagePayload, MessageCreateOptions } from "discord.js";
import { IBotInteraction } from "../api/capi";

// Hardcoded source and target
const SOURCE_GUILD_ID = "838203182630305822";
const SOURCE_CHANNEL_ID = "1065644982213542020";
const TARGET_GUILD_ID = "1029199405657620500"; // Change if needed
const TARGET_CHANNEL_ID = "1379913904884289556"; // Change if needed

export default class echochannel implements IBotInteraction {
    name(): string {
        return "echochannel";
    }
    help(): string {
        return "Echoes the last message from the test server's channel to the target channel in another server.";
    }
    cooldown(): number {
        return 2;
    }
    isThisInteraction(command: string): boolean {
        return command === "echochannel";
    }
    data() {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help());
    }
    perms(): "admin" | "user" | "both" {
        return "admin";
    }
    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        // Fetch source channel
        const sourceGuild = await Bot.guilds.fetch(SOURCE_GUILD_ID);
        const sourceChannel = await sourceGuild.channels.fetch(SOURCE_CHANNEL_ID);
        if (!sourceChannel || !sourceChannel.isTextBased()) {
            await interaction.reply({ content: "Source channel not found or not text-based.", ephemeral: true });
            return;
        }
        const sourceTextChannel = sourceChannel as TextChannel;
        const sourceMessages = await sourceTextChannel.messages.fetch({ limit: 1 });
        const lastSourceMsg = sourceMessages.first();
        if (!lastSourceMsg) {
            await interaction.reply({ content: "No messages found in source channel.", ephemeral: true });
            return;
        }

        // Fetch target channel
        const targetGuild = await Bot.guilds.fetch(TARGET_GUILD_ID);
        const targetChannel = await targetGuild.channels.fetch(TARGET_CHANNEL_ID);
        if (!targetChannel || !targetChannel.isTextBased()) {
            await interaction.reply({ content: "Target channel not found or not text-based.", ephemeral: true });
            return;
        }
        const targetTextChannel = targetChannel as TextChannel;
        const targetMessages = await targetTextChannel.messages.fetch({ limit: 1 });
        const lastTargetMsg = targetMessages.first();

        // Prepare message content and attachments
        const messageOptions: MessageCreateOptions = {};
        
        // Add text content if it exists
        if (lastSourceMsg.content) {
            messageOptions.content = lastSourceMsg.content;
        }
        
        // Handle attachments (images, files, etc.)
        if (lastSourceMsg.attachments.size > 0) {
            const attachments = Array.from(lastSourceMsg.attachments.values());
            const attachmentBuilders = attachments.map(attachment => 
                new AttachmentBuilder(attachment.url, { name: attachment.name || 'attachment.png' })
            );
            messageOptions.files = attachmentBuilders;
        }
        
        // If we have nothing to send, inform the user
        if (!messageOptions.content && (!messageOptions.files || messageOptions.files.length === 0)) {
            await interaction.reply({ content: "The last message in the source channel has no content or attachments to forward.", ephemeral: true });
            return;
        }

        // Send the message to the target channel
        if (!lastTargetMsg) {
            // If no messages, just send
            await targetTextChannel.send(messageOptions);
        } else {
            // Reply to the last message in the target channel
            await lastTargetMsg.reply(messageOptions);
        }

        await interaction.reply({ content: "Echoed the last message from the source channel to the target channel.", ephemeral: true });
    }
}
