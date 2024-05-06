import * as Discord from "discord.js";
import { IBotEvent } from "../api/eapi";
import { IBotReact } from "../api/rapi";
import { QuickDB } from "quick.db";
const db = new QuickDB();

export default class skatch implements IBotReact {

    name(): string {
        return "skatch";
    }

    help(): string {
        return "skatch";
    }   

    async use(reaction: Discord.MessageReaction | Discord.PartialMessageReaction, user: Discord.User | Discord.PartialUser, Bot: Discord.Client<boolean>): Promise<void> {
        console.log("HI BUD");
        console.log(`${reaction.message.author}'s message "${reaction.message.content}" gained a reaction!`);
        // The reaction is now also fully available and the properties will be reflected accurately:
        console.log(`${reaction.count} user(s) have given the same reaction to this message!`);
        db.add(`${reaction.message.author!.id}.points`,1);

        reaction.message.channel.send("That bastard reacted... HUE!?")
    }
  }