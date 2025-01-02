import { Client, Role, Interaction, CommandInteraction, User, RoleManager, GuildMemberRoleManager, PermissionFlagsBits, CommandInteractionOptionResolver, ChatInputCommandInteraction, SlashCommandStringOption, AttachmentBuilder, Message, ActionRowBuilder, SelectMenuBuilder, ComponentType, ButtonStyle } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { SlashCommandBuilder } from '@discordjs/builders';
import * as Discord from "discord.js";
import { QuickDB } from "quick.db";
const db = new QuickDB();
import convertToLatex from "../util/Texer.js";
import * as fs from 'fs';
import { randProb } from "../util/randProbGen.js";
import { StringSelectMenuBuilder } from "discord.js";
import { ButtonBuilder } from "discord.js";
import rr from "./renderer.js";
import Titles from "../util/Titles.js";
import { randint } from "../index.js";
// @ts-ignore
import * as glicko2 from "glicko2";
var history = db.table('history');
import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync } from "fs";
const genAI = new GoogleGenerativeAI("AIzaSyBv0y1ri9woqXzPouncQWZiH8fbxgGJZQo");

let Renderer = new rr()

export default class prob implements IBotInteraction {

    name(): string {
        return "prob";
    } 

    help(): string {
        return "prob";
    }   
    
    cooldown(): number {
        return 25;
    }

    isThisInteraction(command: string): boolean {
        return command === "prob";
    }

    data() {
        return new SlashCommandBuilder()
    .setName(this.name())
    .setDescription(this.help())
    }

    perms(): "admin" | "user" | "both" {
        return 'both';
    }

    private async returnLB(msg: Discord.ChatInputCommandInteraction, leaderboardData: [string, number, number][]){
        // Fetch data from database
       // const leaderboardData = await this.fetchLeaderboardData(msg.guild!.id, msg);

        // Create and send the embed with pagination
        const embed = this.createLeaderboardEmbed(leaderboardData, 0, msg); // Start at page 0
        const buttons: any = this.createPaginationButtons(0);
        await msg.channel!.send({ embeds: [embed], components: [buttons]});

        let currentPage = 0;

        const filter = (i: Discord.Interaction) => i.isButton() && i.user.id === msg.user.id;

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
                    .setStyle(Discord.ButtonStyle.Primary)
                    .setDisabled(currentPage === 0),  // Disable if it's the first page
                new Discord.ButtonBuilder()
                    .setCustomId(`next_${currentPage}`)  // Embedding the current page number
                    .setLabel('Next')
                    .setStyle(Discord.ButtonStyle.Primary),
            );

        return buttons;
    }

    private isNumber(value?: string | number): boolean
    {
       return ((value != null) &&
               (value !== '') &&
               !isNaN(Number(value.toString())));
    }

    private createLeaderboardEmbed(userArray: [string, number, number][], page: number, msg: Discord.ChatInputCommandInteraction): Discord.EmbedBuilder {
        const begint = page * 10;
        const endt = Math.min(userArray.length - 1, begint + 9);
        const embed = new Discord.EmbedBuilder()
            .setTitle('ELO Leaderboard')
            .setColor('Aqua')
            .setDescription('💀 Here are the top ppl who have the highest Ratings!? 💀 ')
            .setTitle('Points Leaderboard!')
            .setAuthor({name: msg.user!.username, iconURL: msg.user!.avatarURL()!})
           // .setImage('https://i.redd.it/l28662sbcec51.png')
            .setTimestamp()
            .setThumbnail('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSD40R2DKe8m_WuhxZE-MH-n_A4cohVkR4H3nvLD-csGw&s');

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
    


    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        const hi: any[] = await randProb() as any[];
        await interaction.deferReply();
        
        let probStatement = hi[0];
        let probAnswer = hi[1];
        let answer = hi[2];
        let rating = hi[3];
        let probYear = hi[4];
        let hint = "N/A";
        try {
            probStatement = await this.fixLaTeX(hi[0]);
            hint = await this.getHint(probStatement,probAnswer);
        } catch (e) {
            console.log(e);
        }
        console.log(`The hint: ${hint}`);
        console.log(probStatement)
       
        

        

        const skipButton = new ButtonBuilder()
        .setCustomId('skip_problem')
        .setLabel('Skip Problem')
        .setStyle(ButtonStyle.Danger);

        const buttonRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(skipButton);


        const answers = [
    {
        label: 'A',
        description: 'oke',
        value: 'A'
    },
    {
        label: 'B',
        description: 'oke',
        value: 'B'
    },
    {
        label: 'C',
        description: 'oke',
        value: 'C'
    },
    {
        label: 'D',
        description: 'oke',
        value: 'D'
    },
    {
        label: 'E',
        description: 'oke',
        value: 'E'
    }
];

        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select')
                    .setPlaceholder('Pick an answer!')
                    .addOptions(answers)
            );
        
        let expiration = 20*60*1000;

        const stuff = await Renderer.render(probStatement);
        // hmm file name and
        const file = stuff[1] as AttachmentBuilder;
        const a = stuff[0];
        
        // set color based on rating

        const skinnyEmbed = new EmbedBuilder()
    .addFields(
        { name: 'Rating', value: `||${Math.round(rating)}||`, inline: true },
        { name: 'Hint', value: `|| ${hint} ||`, inline: true }
    ).setColor(Titles.getTitle(rating)[1]).setFooter({ text: `Year: ${probYear}` });



        // Sending the question embed and the select menu
        let msgToHold = await interaction.editReply!({
            content: `<@${interaction.user.id}>`, // Replace 'RoleId' with the actual role ID
            components: [row,buttonRow as any],
            files: [file],
            embeds: [skinnyEmbed]
        });

        fs.unlink((a as any), (err: any) => {
            if (err) {
                console.error('Error deleting the file:', err);
            } else {
                console.log('File successfully deleted');
            }
        });

        const collector = msgToHold.createMessageComponentCollector({
            time: expiration,
           // componentType: ComponentType.StringSelect
        });

        let tryCount = 1
        collector.on('collect', async i => {
            console.log(i.customId);
            if (i.user.id !== interaction.user.id){ // Only allow the original author to interact
                return i.reply({
                    content: "https://y.yarn.co/cd8c7546-28bc-47ca-bb16-42651c471d7e_text.gif",
                    ephemeral: true
                });
            }  

            if (i.customId === 'skip_problem') {
                collector.stop('skipped');
                return await i.reply({ content: "Problem skipped successfully.", ephemeral: true });
            }

            
            const selection = (i as any).values[0].trim();  // Trimming any extra whitespace
            let verdict = selection == answer ? "RIGHT!?" : "WRONG!";  // Using strict comparison and ternary operator for clarity
        
            await i.reply({content: `You selected ${selection}... and you are ${verdict}`, ephemeral: true});
        
            if (verdict === "RIGHT!?") {
                collector.stop('answerCorrect');  // Stop the collector with a reason
                
            } else {
                // Optionally handle the wrong answer case, e.g., logging, counting attempts, etc.
                tryCount++;
            }
        });
    

        collector.on('end', async (collected,reason) => {
            console.log(`Collected ${collected.size} interactions.`);
            let isSkip = false;
            if (reason === 'skipped') { // make sure user cant get wrong then skip to avoid Rating Loss
                await msgToHold.edit({
                    content: "You've opted to skip the problem.",
                    components: []
                });
                isSkip = true;
            } else {

                await msgToHold.edit({
                    content: "IT'S OVER, YOU HUE!?"
                });
            }

            let result = 0;
            if (tryCount == 1){
                if (isSkip)
                    return;
                interaction.channel?.send("Nice, you got it right. I will remember this.");
                result = 1;
            } else {
                interaction.channel?.send("You got it wrong, but it's okay. I will remember this.")
            }
            let arr: [string, number, number][] = [[interaction.user.id, (await db.get(`${interaction.user.id}.pointsAOPS`))!, 0]];
            await this.update(interaction.user, rating, result);
            arr[0][2] = (await db.get(`${interaction.user.id}.pointsAOPS`))!;
            this.returnLB(interaction, arr);
        });
                
    }

    async update(userW: User, problemRating: number, result: number){
        var ranking = new glicko2.Glicko2();
        let p1s = [await db.get(`${userW!.id}.pointsAOPS`),await db.get(`${userW!.id}.rdAOPS`),await db.get(`${userW!.id}.volAOPS`)];
        let p2s = [problemRating,1,0.06];

        /*console.log("Ryan old rating: " + p1s[0]);
console.log("Ryan old rating deviation: " + p1s[1]);
console.log("Ryan old volAOPSatility: " + p1s[2]); */

        var p1 = ranking.makePlayer(p1s[0],p1s[1],p1s[2]);
        var p2 = ranking.makePlayer(p2s[0],p2s[1],p2s[2]);
        await ranking.updateRatings([[p1,p2,result]]);
        console.log(p1s);
        /*console.log("Ryan new rating: " + p1.getRating());
console.log("Ryan new rating deviation: " + p1.getRd());
console.log("Ryan new volAOPSatility: " + p1.getvolAOPS());  */
        await db.set(`${userW!.id}.pointsAOPS`,p1.getRating());
        await db.set(`${userW!.id}.rdAOPS`,p1.getRd());
        await db.set(`${userW!.id}.volAOPS`,p1.getVol());
        history.push(`${userW.id}.AOPS`,p1.getRating());
    }

    

// Access your API key as an environment variable (see "Set up your API key" above)

// Converts local file information to a GoogleGenerativeAI.Part object.
/*function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(readFileSync(path)).toString("base64"),
      mimeType
    },
  };
} */

async fixLaTeX(prompt: string) {
    // For text-and-image input (multimodal), use the gemini-pro-vision model
    const systemMessage = `I will give you some LaTeX for an AMC/AIME problem that may contain errors or unwanted characters (such as random HTML entities or the \begin{problem} environment). Please fix any errors so that it can be rendered correctly in LaTeX. Ensure that the output does not include the \begin{problem} environment or any other unnecessary environments, and that it does not introduce errors like LaTeX Warning: Command \~ invalid in math mode. Format the answer choices so that each one is on a new line, using $\\~\\$ to create a new line before the answer choices. Only provide the fixed LaTeX code so I can copy and paste it directly.`;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" ,systemInstruction: systemMessage});

    const imageParts = [
        //fileToGenerativePart("image1.png", "image/png"),
        //fileToGenerativePart("image2.jpeg", "image/jpeg"),
    ];

    const result = await model.generateContent([prompt]);
    const response = await result.response;
    const text = response.text();
    return text;
}

async getHint(problem: string, soln: string) {
    // For text-and-image input (multimodal), use the gemini-pro-vision model
    const systemMessage = "You will be given an AMC/AIME problem and its solution, and your task is to generate a hint for the problem. It should be relevant to the problem and solution and be helpful to someone struggling with the problem. It should be at most 10 words.";
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" ,systemInstruction: systemMessage});

    const imageParts = [
        //fileToGenerativePart("image1.png", "image/png"),
        //fileToGenerativePart("image2.jpeg", "image/jpeg"),
    ];

    const result = await model.generateContent([`Problem: ${prob}\n Solution: ${soln}`]);
    const response = await result.response;
    const text = response.text();
    return text;
}

async getTags(problem: string, soln: string) {
    // For text-and-image input (multimodal), use the gemini-pro-vision model
    const systemMessage = "You will be given an AMC/AIME problem and its solution, and your task is to generate a list of tags for the problem. They should be relevant to the problem and solution and not be superfluous like contest-math. There should be 5 tags max.";
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" ,systemInstruction: systemMessage});

    const imageParts = [
        //fileToGenerativePart("image1.png", "image/png"),
        //fileToGenerativePart("image2.jpeg", "image/jpeg"),
    ];

    const result = await model.generateContent([`Problem: ${prob}\n Solution: ${soln}`]);
    const response = await result.response;
    const text = response.text();
    return text;
}

};


//console.log(await run(`Let $P$ be the parabola with equation $y=x^2$ and let $Q = (20, 14)$. There are real numbers $r$ and $s$ such that the line through $Q$ with slope $m$ does not intersect $P$ if and only if $r$ &lt; $m$ &lt; $s$. What is $r + s$?
//$\textbf{(A)}\ 1\qquad\textbf{(B)}\ 26\qquad\textbf{(C)}\ 40\qquad\textbf{(D)}\ 52\qquad\textbf{(E)}\ 80$`));
//}

/*
'gemini Problem: (''Kiran Kedlaya'') Three nonnegative real numbers $r_1$, $r_2$, $r_3$ are written on a blackboard. These numbers have the property that there exist integers $a_1$, $a_2$, $a_3$, not all zero, satisfying $a_1r_1 + a_2r_2 + a_3r_3 = 0$. We are permitted to perform the following operation: find two numbers $x$, $y$ on the blackboard with $x \le y$, then erase $y$ and write $y - x$ in its place. Prove that after a finite number of such operations, we can end up with at least one $0$ on the blackboard.

Solution: Every time we perform an operation on the numbers on the blackboard $R = \left < r_1, r_2, r_3 \right >$, we perform the corresponding operation on the integers $A = \left < a_1, a_2, a_3 \right >$ so that $R \cdot A = 0$ continues to hold.  (For example, if we replace $r_1$ with $r_1 - r_2$ then we replace $a_2$ with $a_1 + a_2$.)

It's possible to show we can always pick an operation so that $|A|^2$ is strictly decreasing. [[Without loss of generality]], let $r_3 > r_2 > r_1$ and $a_3$ be positive. Then it cannot be true that both $a_1$ and $a_2$ are at least $\frac { - a_3}{2}$, or else $a_1r_1 + a_2r_2 + a_3r_3 > 0$. Without loss of generality, let $a_1 < \frac { - a_3}{2}$. Then we can replace $a_1$ with $a_1 + a_3$ and $r_3$ with $r_3 - r_1$ to make $|A|$ smaller. Since it is a strictly decreasing sequence of positive integers, after a finite number of operations we have $a_3 = 0$. We can now  see that this result holds for $(r_1,r_2,0)$ if and only if it holds for $(1,\frac{r_2}{r_1},0)$. We can see that $\frac{r_2}{r_1}$ is a rational number given that $a_3$ = 0. It is a well known result of the euclidean algorithm that if we continue to perform these operations, $r_1$ or $r_2$ will eventually be 0.

Your task: Write a set of tags for this problem, comma separated, based on the question and solution. Maximum 5. Should be relevant to the problem and not superfluous like “contest-math”. Also provide a numerical rating of the problem.
*/