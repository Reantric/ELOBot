import * as Discord from "discord.js";
import { IBotEvent } from "../api/eapi";
import Titles from "../util/Titles.js";
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
let usrPoints: Discord.Collection<string,number> = new Collection();

export default class check implements IBotEvent {

    name(): string {
        return "check";
    }

    help(): string {
        return "check";
    }       


    private async returnLB(msg: Discord.Message, leaderboardData: [string, number, number][]){
        // Fetch data from database
       // const leaderboardData = await this.fetchLeaderboardData(msg.guild!.id, msg);

        // Create and send the embed with pagination
        const embed = this.createLeaderboardEmbed(leaderboardData, 0, msg); // Start at page 0
        const buttons: any = this.createPaginationButtons(0);
        await msg.channel.send({ embeds: [embed], components: [buttons]});

        let currentPage = 0;

        const filter = (i: Discord.Interaction) => i.isButton() && i.user.id === msg.author.id;

        const collector = msg.channel?.createMessageComponentCollector({ filter, time: 60000 }); // 1 minute for interaction

        collector?.on('collect', async (i: Discord.ButtonInteraction) => {
            await i.deferUpdate(); // acknowledge the interaction

            // Extract the direction and page number from the customId
            const [direction, pageStr] = i.customId.split('_');
            currentPage = parseInt(pageStr, 10);

            if (direction === 'next') {
                currentPage++;
            } else if (direction === 'previous' && currentPage > 0) { // Prevent going to negative pages
                currentPage--;
            }

            // Fetch new data for the page (if your data might change in real-time) or slice the existing data
            // const newLeaderboardData = await this.fetchLeaderboardData(interaction.guild!.id, interaction);

            const newEmbed = this.createLeaderboardEmbed(leaderboardData, currentPage, msg); // use newLeaderboardData if you fetched fresh data
            const newButtons: any = this.createPaginationButtons(currentPage);

            await i.editReply({ embeds: [newEmbed], components: [newButtons] });
        });

        collector?.on('end', () => {

        });
    }

    private createPaginationButtons(currentPage: number): Discord.ActionRowBuilder {
        const buttons = new Discord.ActionRowBuilder()
            .addComponents(
                new Discord.ButtonBuilder()
                    .setCustomId(`previous_${currentPage}`)  // Embedding the current page number
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === 0),  // Disable if it's the first page
                new Discord.ButtonBuilder()
                    .setCustomId(`next_${currentPage}`)  // Embedding the current page number
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary),
            );

        return buttons;
    }

    private isNumber(value?: string | number): boolean
    {
       return ((value != null) &&
               (value !== '') &&
               !isNaN(Number(value.toString())));
    }

    private createLeaderboardEmbed(userArray: [string, number, number][], page: number, msg: Discord.Message): Discord.EmbedBuilder {
        const begint = page * 10;
        const endt = Math.min(userArray.length - 1, begint + 9);
        const embed = new Discord.EmbedBuilder()
            .setTitle('ELO Leaderboard')
            .setColor('Aqua')
            .setDescription('💀 Here are the top Fuckers who have the highest Ratings!? 💀 ')
            .setTitle('Points Leaderboard!')
            .setAuthor({name: msg.author!.username, iconURL: msg.author!.avatarURL()!})
           // .setImage('https://i.redd.it/l28662sbcec51.png')
            .setTimestamp()
            .setThumbnail('https://i.imgur.com/aowYZQG.jpeg');

        for (var i = begint; i <= endt; ++i) {
            let username: any = userArray[i][0];
            var title = "";
            if (this.isNumber(userArray[i][0]))
                username = msg.client.users.cache.find(user => user.id === userArray[i][0])?.username;//cannot read property 0 of indefined
            else
                title = "**BOT**";
            let rounded,rounded2;
            let stable = "";
            if (isNaN(userArray[i][1])) {
                console.log(username, userArray[i]);
                rounded = NaN;
                rounded2 = NaN;
                // userArray[i][1] = "N/A";
            }
            else {
                rounded = Math.round(userArray[i][1]);
                rounded2 = Math.round(userArray[i][2]);
            }
            
            let initializer = "";

            if (i == 0)
                initializer = `<:first_place:822885876144275499>`;
            else if (i == 1)
                initializer = `<:second_place:822887005679648778>`;
            else if (i == 2)
                initializer = `<:third_place:822887031143137321>`;


            var value: any = userArray[i][1];
            if (userArray[i][2] > 150)
                stable="?";
            
            if (isNaN(value))
                value = "N/A"
            else if (stable=="" && title == "")
                title = Titles.getAbbrev(value);
            
            let congoMsg = "";
            if (rounded2 >= 2000 && stable=="" && title!="**BOT**"){
                let nTit = Titles.getAbbrev(rounded2);
                if (title != nTit){
                    congoMsg = ` (🥳 **${nTit}** 🥳)`
                }
            }

            let cnt = "";
            if (userArray[i][0] == "Roger"){
                cnt = " (8) ";
            } else if (userArray[i][0] == "Hue"){
                cnt = " (25) ";
            }
            else if (userArray[i][0] == "Ou"){
                cnt = " (99) ";
            }

            if (userArray[i][0] == msg.member!.user.id)
                embed.addFields(
                    { name: `${initializer} **#${(i + 1)}: ${title} ${username}** (You)`, value: `**${rounded}** → **${rounded2}**${congoMsg}` },)
            else
                embed.addFields(
                    { name: `${initializer} #${(i + 1)}: ${title} ${username}${cnt}`, value: `**${rounded}** → **${rounded2}**${congoMsg}` },)
        }

       /* let ind = this.search(userArray,msg.member!.user.id);
        let initializer = "";

                if(ind==0)
                        initializer = `<:first_place:822885876144275499>`;
                else if(ind==1)
                        initializer = `<:second_place:822887005679648778>`;                
                else if(ind==2)
                        initializer = `<:third_place:822887031143137321>`;
        
                        
        title = Titles.getAbbrev(userArray[ind][1]);
        embed.addFields({
            name: `You → ${initializer} **#${ind+1}: ${title} ${msg.member!.user.username}**`,
            value:`**${Number(Math.round(userArray[ind][1]))}**`
        }); */

        return embed;

    }
    
    private search(array: any[][], targetValue: any) {
        // genuinely shitty algorithm, use BS later
        for (var i = 0; i < array.length; i++){
            if (array[i][0] == targetValue)
                return i;
        }
        return -1;
    }

    async update(userW: Discord.User, user: Discord.User){
        var ranking = new glicko2.Glicko2();
        let p1s = [await db.get(`${userW!.id}.points`),await db.get(`${userW!.id}.rd`),await db.get(`${userW!.id}.vol`)];
        let p2s = [await db.get(`${user!.id}.points`),await db.get(`${user!.id}.rd`),await db.get(`${user!.id}.vol`)];

        var p1 = ranking.makePlayer(p1s[0],p1s[1],p1s[2]);
        var p2 = ranking.makePlayer(p2s[0],p2s[1],p2s[2]);
        ranking.updateRatings([[p1,p2,1]]);
        console.log(p1s);
        console.log("Ryan new rating: " + p1.getRating());
console.log("Ryan new rating deviation: " + p1.getRd());
console.log("Ryan new volatility: " + p1.getVol());
        await db.set(`${userW!.id}.points`,p1.getRating());
        await db.set(`${userW!.id}.rd`,p1.getRd());
        await db.set(`${userW!.id}.vol`,p1.getVol());
        await db.set(`${user!.id}.points`,p2.getRating());
        await db.set(`${user!.id}.rd`,p2.getRd());
        await db.set(`${user!.id}.vol`,p2.getVol());
    }
    
    
    async runEvent(msg: Discord.Message, Bot: Discord.Client): Promise<void> {
        if (msg.author.id != '432610292342587392')
            return;
        
        let m = msg.content.toLowerCase();
        if (m.includes("type a word containing")){
            const currentWord = await standings.get("currentWord");

        // Now check if the first element exists (is not undefined)
        if (currentWord && currentWord[0] !== undefined) {
            const key = currentWord[0]; // Extract the first element

            // If usrPoints doesn't have the key, initialize it with 0
            if (!usrPoints.has(key)) {
                usrPoints.set(key, 0);
            }

            // Increment the value by 100
            usrPoints.set(key, usrPoints.get(key)! + 100);
        }
        
            count++;
            let phrase = m.slice(m.length-5,m.length-2);
            let usr: Discord.User = msg.mentions.users.first()!;
            msg.channel.send(phrase);
            if (!usrPoints.has(usr.id)){
                usrPoints.set(usr.id,0);
            }
            await standings.set("currentWord",[usr.id,phrase]);
        }
    
      if (m.includes("eliminated")){
        await standings.push('standings',[msg.mentions.users.first()!.id,Math.floor(count)]);
        //let v = await standings.get('standings');
       // console.log(v);
      }
      if (m.includes("nobody")){
        //standings.set('standings',[]);
        await standings.push('standings',['Roger',8]);
        await standings.push('standings',['Hue',25]); //
        await standings.push('standings',['Ou',99]); //
       // console.log("Hi");
      }

      if (m.includes("cocktail of teas")){
        standings.set('standings',[]);
        usrPoints.clear();
        count = 0;
        return;
      }
      if (m.includes("won the game")){
        if (msg.mentions.users.first() != undefined)
            await standings.push('standings',[msg.mentions.users.first()!.id,count]);
        let v: [string,number][] = await standings.get('standings') as [string,number][];
        v.sort((a, b) => {
            // a[1] and b[1] are the numbers in each sub-array you're comparing
            return a[1] - b[1];
          });
        
        console.log(v);
        let arr: [string,number,number][] = []
        let ppl: any = []
        var ranking = new glicko2.Glicko2();

        for (var i = 0; i < v.length; i++){
            arr.push([v[i][0],await (db.get(`${v[i][0]}.points`) as any),0]);
            ppl.push([ranking.makePlayer(await db.get(`${v[i][0]}.points`),await db.get(`${v[i][0]}.rd`),await db.get(`${v[i][0]}.vol`))]);
        }
        
        // perform update
        //await this.update(Bot.users.cache.get(v[v.length-1])!,Bot.users.cache.get(v[v.length-2])!);
        ppl = ppl.reverse();
        await ranking.updateRatings(ranking.makeRace(ppl));
        ppl = ppl.reverse();
        for (var i = 0; i < v.length; i++){
            await db.set(`${v[i][0]}.points`,ppl[i][0].getRating()); // assume for now no ties, thats why ind 0
            await db.set(`${v[i][0]}.rd`,ppl[i][0].getRd());
            await db.set(`${v[i][0]}.vol`,ppl[i][0].getVol());
            console.log( await db.get(`${v[i][0]}.points`));
        }
        
        for (var i = 0; i < v.length; i++){
            arr[i][2] = await db.get(`${v[i][0]}.points`) as any;
            history.push(v[i][0],arr[i][2]);
        }
        
        arr = arr.reverse();
        this.returnLB(msg,arr);
        standings.set('standings',[]);
        count = 0;
        usrPoints.clear();
      }

      
    
                

    }
  }