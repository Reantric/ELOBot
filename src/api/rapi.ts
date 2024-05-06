/**
 * Interface for event
 */
import * as Discord from "discord.js";

export interface IBotReact {
    name(): string;
    help(): string;
    use(react: Discord.MessageReaction | Discord.PartialMessageReaction, user: Discord.User | Discord.PartialUser, Bot: Discord.Client): Promise<void>;
}