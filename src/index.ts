import { ButtonInteraction, Client, Events, Guild, GuildMember, MessageReaction, PartialMessageReaction, PartialUser, Partials, User } from 'discord.js';
import { RoleManager, GuildChannelManager } from 'discord.js';
import { ApplicationCommand, ApplicationCommandPermissions } from 'discord.js';
import { Interaction, CommandInteraction } from 'discord.js';
import { Snowflake, Collection } from 'discord.js';
import { PermissionFlagsBits, GatewayIntentBits } from 'discord.js';
import { ChannelType, OverwriteType, ActivityType, ApplicationCommandPermissionType } from 'discord.js';
import { RoleResolvable } from 'discord.js';
import { Message } from 'discord.js';

import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

import { IBotInteraction } from "./api/capi";
import { IBotEvent } from "./api/eapi";

import { setupInfo } from './setup.js';
import { secrets } from './config';

import {config} from 'dotenv';
import { resolve } from 'path'; // Ensure path is imported
import { IBotReact } from './api/rapi';

const __dirname = import.meta.dirname;
config({ path: resolve(__dirname, '../.env') }); // Adjust the relative path according to your project's structure
console.log('TOKEN:', process.env.TOKEN);
console.log('CLIENT ID:', process.env.CLIENT_ID);

import { QuickDB } from "quick.db";
const db = new QuickDB();

var userBehavior = db.table('user');
var questionId = db.table('id');
var standings = db.table('rank');
var history = db.table('history');

const botIntents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
];

const botPartials = [
    Partials.Message, Partials.Channel, Partials.Reaction
];
const Bot: Client = new Client({intents: botIntents,partials:botPartials});
let commands: IBotInteraction[] = [];
let events: IBotEvent[] = [];
let reacts: IBotReact[] = [];
const command_cooldowns: any = new Collection();

export function randint(min: number,max: number) {
    return Math.floor(Math.random()*(max-min+1)+min);
}

const student = {
    pointsAOPS:1200,
    rdAOPS:400,
    volAOPS:0.2,

    pointsNIM:800,
    rdNIM:400,
    volNIM:0.2,
    bot: false
}

function botProfile(rating: number){
    return {
        pointsAOPS:1200,
        rdAOPS:100,
        volAOPS:0.15,

        pointsNIM:rating,
        rdNIM:400,
        volNIM:0.2,
        bot: true
    }
}


let studentID: string;
let teacherID: string;

/**
 * Setup bot in new server
 * @param guild
 * @returns 
 */
async function init() {
    await Bot.guilds.cache.get(setupInfo.guildID)?.commands.fetch()
        .then((col: Collection<Snowflake, ApplicationCommand>) => {
        loadCommands(`${__dirname}/commands`,col);
        loadEvents(`${__dirname}/events`)
        loadReacts(`${__dirname}/reacts`)
    })
}

Bot.once("ready", async () => {
    console.log("This bot is online!");
    await init();

    Bot.user!.setPresence({ 
        activities: [{ 
            name: 'Sir Amog', 
            type: ActivityType.Watching 
        }], 
        status: 'online' });
    Bot.user?.setUsername("Linty");
    questionId.set("id", 0);
    standings.set("standings", []);
    standings.set("currentWord",[]);

    initIntelligentAgents();
    
    Bot.guilds.fetch().then(() => {
        Bot.guilds.cache.forEach(async (guild: Guild) => {

            guild.members.fetch().then((collection) => {
                collection.forEach((member: GuildMember) => {
                    db.has(member.id).then((a: any) => {
                        if (!a){
                            db.set(member.id, student);
                            console.log(member.user.username)
                        }
                    })

                    history.has(member.id).then(async (a: any) => {
                        if (!a){
                            await history.set(member.id, [student.pointsAOPS]);
                            console.log(member.user.username);
                        }
                    })
                   
                })
            })
            
        })
    })
    })

    
Bot.on("guildMemberAdd", member => {
   if (!db.has(member.id)){ //if new member not in db, add them!
    db.set(member.id, student);
    history.set(member.id,[student.pointsAOPS]);
   }
   var role: any = member.guild.roles.cache.find(role => role.name == "smilliam");
   member.roles.add(role);
})

Bot.on("interactionCreate", async (interaction: Interaction) => {
   // console.log("I fired...",interaction.isCommand());
	if (!interaction.isCommand()) return;
    try {
        handleCommand(interaction);
    } catch (e) {
        console.log(e);
    }
});

async function handleButtonPress(interaction: ButtonInteraction){
   // interaction.customId
}

Bot.on("messageCreate", msg => {
    if (msg.author.bot && msg.author.id != '432610292342587392') return;
    handleEvent(msg); // checks every message regardless of what it contains
    if (msg.channel.type == ChannelType.DM){
        msg.author.send(`Please talk to me on a server! This ensures more engagement and reliability.`);
        return;
    }
})

/*Bot.on(Events.MessageReactionAdd, async (reaction, user) => {
	// When a reaction is received, check if the structure is partial
	if (reaction.partial) {
		// If the message this reaction belongs to was removed, the fetching might result in an API error which should be handled
		try {
			await reaction.fetch();
            console.log("it worked!")
		} catch (error) {
			console.error('Something went wrong when fetching the message:', error);
			// Return as `reaction.message.author` may be undefined/null
			return;
		}
	}

	// Now the message has been cached and is fully available
    handleReacts(reaction,user);
}); */

Bot.on("guildCreate",async guild => {
    await init();
   // await init(guild);
    guild.members.fetch().then((collection) => {
        collection.forEach((member: GuildMember) => {
            if (!db.has(member.id)){ //if User ID is not already in database (db) then add them, else do nothing
                db.set(member.id, student);
                history.set(member.id,[student.pointsAOPS]);
            }

        })
    })
})

async function handleEvent(msg: Message){
    for (const eventClass of events){
        await eventClass.runEvent(msg,Bot);
    }
}

async function handleReacts(react: MessageReaction | PartialMessageReaction, user: User | PartialUser){
    for (const reactsClass of reacts){
        await reactsClass.use(react,user,Bot);
    }
}

async function handleCommand(interaction: CommandInteraction){
    let command = interaction.commandName;
    let args: any = []//msg.content.split(" ").slice(1);
    //Make command and args lowercase

    for (const commandClass of commands){
        try {
            if (!commandClass.isThisInteraction(command) ){
                continue;
            } //Checks IBotCommands (located in api.ts) for layout, if isThisCommand String is not equal to command, skip!
            if (!command_cooldowns.has(commandClass.name())) { //if name String in capi.ts (IBotCommand) == to command
                command_cooldowns.set(commandClass.name(), new Collection()); //store the command name and a obj key-val 
            }
            
            const now = Date.now();
            const timestamps = command_cooldowns.get(commandClass.name()); //whatever is in the Discord.Collection, yeah thats timestamps now!
            const cooldownAmount = (commandClass.cooldown() || 3) * 1000; //from ms to sec
            //Begins the cooldown command process!
            if (timestamps.has(interaction.member?.user.id)) { //checks to see if user in col
                const expirationTime: number = timestamps.get(interaction.member?.user.id) + cooldownAmount; //expiration is time assigned to user + cooldownAmt
            
                if (now < expirationTime) { // This code is absolutely abysmal, my god a pizza pasta
                    const timeLeft = (expirationTime - now) / 1000;
                    if (timeLeft > 3600){
                        return interaction.reply({ephemeral: true, content: `please wait ${Math.round(timeLeft/3600)} more hour(s) before reusing the \`${commandClass.name()}\` command.`});
                    } else if (timeLeft > 60 && timeLeft < 3600){
                        return interaction.reply({ephemeral: true, content:`please wait ${Math.round(timeLeft/60)} more minute(s) before reusing the \`${commandClass.name()}\` command.`});
                    } else {
                    return interaction.reply({ephemeral: true, content:`please wait ${Math.round(timeLeft)} more second(s) before reusing the \`${commandClass.name()}\` command.`});
                } //if hours, run 1, if min, run2, else run3
            }
            }
            timestamps.set(interaction.member?.user.id, now); //user = key, time = val
            setTimeout(() => timestamps.delete(interaction.member?.user.id), cooldownAmount); //wait cooldownAmt!
            await commandClass.runCommand(interaction,Bot); //allows asynchronous operation and multithreading so multiple things can happen at once! also executes the cmd!
        }
        catch(e){
            console.log(e);
        }  //if error, log it!
    }
} 
export class HelpUtil {
    helpMap: Map<string,string[]>
    
    constructor(){
        this.helpMap = new Map();
    }

    add(name: string,help: string,perms: "user" | "admin" | "both"){
        this.helpMap.set(name,[help,perms]);
    }

    get(){
        return this.helpMap;
    }
}

export const helpUtil = new HelpUtil();

async function loadCommands(commandsPath: string, allSlashCommands: Collection<Snowflake, ApplicationCommand>){
    if (!setupInfo.commands || (setupInfo.commands as string[]).length == 0) return;
    let commandDatas: any[] = [];
    for (const commandName of setupInfo.commands as string[]) {
        // Import the command classes dynamically
        const commandsClass = (await import(`${commandsPath}/${commandName}`)).default;
        const command = new commandsClass() as IBotInteraction;
        helpUtil.add(command.name(), command.help(), command.perms());

        commands.push(command);
        commandDatas.push(command.data().toJSON());
    }
    

    const rest: REST = new REST({ version: '10' }).setToken(process.env.TOKEN!);
    
     (async () => {
        console.log("Attempting")
        try {
            console.log('Started refreshing application (/) commands.');
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID!, setupInfo.guildID),
                { body: commandDatas},
            );

            console.log('Successfully reloaded application (/) commands.');
        } catch (error) {
            console.error(error);
        }
    })(); 
}

async function loadEvents(commandsPath: string){
    if (!setupInfo.events || (setupInfo.events as string[]).length == 0) return; 

    for (const eventName of setupInfo.events as string[]){ //turns events in config.ts into a string array and iterates over them
        const eventsClass = (await import(`${commandsPath}/${eventName}`)).default; //imports the event file (default=ts) from file directory

        const event = new eventsClass() as IBotEvent; //command now follows same layout as IBotCommand in form commandsClass(), created new object
        events.push(event); //adds event to events array
    }
}

async function loadReacts(commandsPath: string){
    if (!setupInfo.reacts || (setupInfo.reacts as string[]).length == 0) return; 

    for (const reactName of setupInfo.reacts as string[]){ //turns events in config.ts into a string array and iterates over them
        const reactsClass = (await import(`${commandsPath}/${reactName}`)).default; //imports the event file (default=ts) from file directory

        const react = new reactsClass() as IBotReact; //command now follows same layout as IBotCommand in form commandsClass(), created new object
        reacts.push(react); //adds event to events array
    }
}

Bot.login(process.env.TOKEN!);

async function initIntelligentAgents(){
    db.has("Random").then((a: any) => {
        if (!a){
            db.set("Random", botProfile(800))
        }
    });
    db.has("2ply").then((a: any) => {
        if (!a){
            db.set("2ply", botProfile(1200));
        }
    }); 

    db.has("5ply").then((a: any) => {
        if (!a){
            db.set("5ply", botProfile(1600));
        }
    }); 

    db.has("10ply").then((a: any) => {
        if (!a){
            db.set("10ply", botProfile(2000))
        }
    }); 

    db.has("Perfect").then((a: any) => {
        if (!a){
            db.set("Perfect", botProfile(2500))
        }
    }); 
   // console.log("ROGER");
    //const hu = await db.get("Roger");
    //console.log(hu);
}