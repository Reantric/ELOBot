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

export default class validate implements IBotEvent {

    name(): string {
        return "validate";
    }

    help(): string {
        return "validate";
    }       
    
    
    async runEvent(msg: Discord.Message, Bot: Discord.Client): Promise<void> {
      /*  if ((await standings.get('currentWord')[0]) == msg.author.id){

        } */
  }
}