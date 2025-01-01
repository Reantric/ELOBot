import * as Discord from "discord.js";
import { IBotEvent } from "../api/eapi";
import Titles from "../util/Titles";
import { ButtonStyle, Collection } from "discord.js";
import { QuickDB } from "quick.db";
const db = new QuickDB();
var standings = db.table('rank');
var history = db.table('history');
// @ts-ignore
import * as glicko2 from "glicko2";

//var Filter = require('bad-words'); //npm install badwords
//let filter = new Filter();
var count = 0;

export default class naughty implements IBotEvent {

    name(): string {
        return "naughty";
    }

    help(): string {
        return "naughty";
    }       
    
    
    async runEvent(msg: Discord.Message, Bot: Discord.Client): Promise<void> {
        // Check if the message contains the specific phrase
        if (msg.content.toLowerCase().includes("say fundamental theorem of abelian groups but")) {
            try {
                // Delete the original message
                await msg.delete();
    
                // Send the response with a tagged mention
                const sentMessage = await msg.channel.send(
                    `<@${msg.author.id}> https://i.pinimg.com/originals/ab/64/74/ab6474fe98a4dc18fa7fbef219e20518.gif`
                );
    
                // Delete the response after 6 seconds
                setTimeout(async () => {
                    try {
                        await sentMessage.delete();
                    } catch (error) {
                        console.error("Error deleting response message:", error);
                    }
                }, 6000);
            } catch (error) {
                console.error("Error processing message:", error);
            }
        }
    }
    
}