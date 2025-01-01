// @ts-ignore
import * as glicko2 from "glicko2";

import {
    Client,
    ChatInputCommandInteraction,
    CommandInteraction,
    SlashCommandBuilder,
    User,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    MessageComponentInteraction,
    ComponentType,
    Message,
    ButtonInteraction,
    Interaction,
} from "discord.js";
import { IBotInteraction } from "../api/capi";
import { QuickDB } from "quick.db";
import Titles from "../util/Titles.js";
import { randint } from "../index.js";

const db = new QuickDB();

export default class Nim implements IBotInteraction {
    private readonly aliases = ["nim"];

    // Configuration
    private readonly MOVE_TIMEOUT = 15000;        // 15 seconds total per turn
    private readonly COUNTDOWN_INTERVAL = 2000;   // 2 seconds between countdown updates

    name(): string {
        return "nim";
    }

    help(): string {
        return "Plays Nim between two users";
    }

    cooldown(): number {
        return 20; // 20 sec
    }

    isThisInteraction(command: string): boolean {
        return this.aliases.includes(command);
    }

    data() {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help())
            .addUserOption(option =>
                option.setName("opponent")
                    .setDescription("User to play Nim against")
                    .setRequired(true)
            );
    }

    perms(): "both" {
        return "both";
    }


    // Handle the "/nim" command
    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        let user1 = interaction.user;
        let user2 = interaction.options.getUser("opponent");

        // Basic checks
        if (!user2) {
            user2 = Bot.user!;
        }
        
        if (user1.id === user2.id) {
            await interaction.reply({ content: "You cannot play against yourself.", ephemeral: true });
            return;
        }
        Bot.user
        if (user2.bot) {
            if (user2.id != Bot.user!.id){
                await interaction.reply({ content: "You cannot play against (other) bots yet.", ephemeral: true });
                return;
            }

            await interaction.reply({ content: "Oh, you think you can beat me? Let's see about that.", ephemeral: true });

            setTimeout(async () => {
                try {
                    await interaction.deferReply();
    
                    // Start the game directly without confirmation
                  //  [user1, user2] = swap(user1, user2); // Randomly decide who starts
              //      await this.startGame(interaction, Bot, user1, user2);
                } catch (error) {
                    console.error("Error starting game against the bot:", error);
                    await interaction.followUp({ content: "There was an error starting the game.", ephemeral: true });
                }
            }, 2000); // 2-second delay (adjust as needed)
    
            return; 
        }

        await interaction.deferReply();

        // Send confirmation message
        const confirmationEmbed = new EmbedBuilder()
            .setColor("Blue")
            .setDescription(`${user2}, do you want to play Nim against ${user1}?`);

        const confirmButton = new ButtonBuilder()
            .setCustomId("confirm_nim")
            .setLabel("✅ Accept")
            .setStyle(ButtonStyle.Success);

        const declineButton = new ButtonBuilder()
            .setCustomId("decline_nim")
            .setLabel("❌ Decline")
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(confirmButton, declineButton);

        const confirmationMessage = await interaction.channel!.send({
            content: `${user2}`,
            embeds: [confirmationEmbed],
            components: [row as any],
        });
       
        const filter = (i: MessageComponentInteraction) =>
            ["confirm_nim", "decline_nim"].includes(i.customId) && i.user.id === (user2 as User).id;

        const collector = confirmationMessage.createMessageComponentCollector({ filter, max: 1, time: 15000 });

        collector.on("collect", async (i) => {
            try {
                if (i.customId === "confirm_nim") {
                    // Start the game
                    await i.update({ components: [] });
                    [user1, user2] = swap(user1, (user2 as User)); // randomly
                    await this.startGame(interaction, Bot, user1, user2);
                } else if (i.customId === "decline_nim") {
                    // Decline
                    await i.update({ content: `${user2} declined the game invitation.`, embeds: [], components: [] });
                }
            } catch (error) {
                console.error("Error handling confirmation interaction:", error);
                if (!i.replied && !i.deferred) {
                    await i.reply({ content: "There was an error processing your response.", ephemeral: true });
                }
            }
        });

        collector.on("end", async (collected) => {
            if (collected.size === 0) {
                // No response
                try {
                    await confirmationMessage.edit({
                        content: `${user2} didn't respond in time.`,
                        embeds: [],
                        components: []
                    });
                } catch (error) {
                    console.error("Error editing confirmation message after timeout:", error);
                }
            }
        });
    }

    private async startGame(
        interaction: ChatInputCommandInteraction,
        Bot: Client,
        user1: User,
        user2: User
    ) {
        // Let everyone know the game is starting
        await interaction.followUp({
            content: `Starting a game of Nim between ${user1} and ${user2}!`
        });
    
        // Initialize game state
        const pileCount = randint(3, 5);
        let piles = Array.from({ length: pileCount }, () => Math.floor(Math.random() * 9) + 1); // make distinct later
        let currentPlayer = user1;
        let gameInProgress = true;
    
        // Create a single "game message" that we'll edit each turn
        const initialEmbed = new EmbedBuilder()
            .setTitle("Nim Game In Progress")
            .setColor("Green")
            .setDescription("Game will update here each turn.");
    
        // Build a resign button
        const resignButton = new ButtonBuilder()
            .setCustomId("resign_nim")
            .setLabel("Resign")
            .setStyle(ButtonStyle.Danger);
    
        // Put the button in a row
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(resignButton);
    
        // Send the initial game message
        let gameMessage = await interaction.channel!.send({
            embeds: [initialEmbed],
            components: [buttonRow as any],
        });
    
        // Main game loop
        while (gameInProgress) {
            // Prepare turn data
            let remainingTime = this.MOVE_TIMEOUT;
            const turnEndTime = Math.floor(Date.now() / 1000) + this.MOVE_TIMEOUT / 1000; // UNIX timestamp for end time
            const pilesVisualization = piles
                .map((pile, index) => `${index + 1}: **${pile}**`)
                .join("\n");
    
            // Prepare the turn embed
            const turnEmbed = new EmbedBuilder()
                .setTitle(`${currentPlayer.username}, it's your turn!`)
                .setColor(currentPlayer == user1 ? "Green" : "Blue")
                .setDescription(
                    `**Piles**:\n${pilesVisualization}\n\n` +
                    `Type your move in the format \`pileIndex numberOfSticks\` (e.g., \`2 3\`), or click "Resign".\n` +
                   // `Time left: **${(remainingTime / 1000).toFixed(0)}**s`
                   `Time left: **<t:${turnEndTime}:R>**`
                );
    
            // Update the game message
           /* await gameMessage.edit({
                embeds: [turnEmbed],
                components: [buttonRow as any],
            }); */
            gameMessage = await interaction.followUp({
                embeds: [turnEmbed],
                components: [buttonRow as any],
            }) as any;
    
            /* Start the countdown timer
            const countdownInterval = setInterval(async () => {
                remainingTime -= this.COUNTDOWN_INTERVAL;
    
                // If time is up, just stop the interval (the collector handles the actual timeout)
                if (remainingTime <= 0) {
                    clearInterval(countdownInterval);
                    return;
                }
    
                const updatedEmbed = new EmbedBuilder()
                    .setTitle(`${currentPlayer.username}, it's your turn!`)
                    .setColor("Green")
                    .setDescription(
                        `**Piles**:\n${pilesVisualization}\n\n` +
                        `Type your move in the format \`pileIndex numberOfSticks\` (e.g., \`2 3\`), or click "Resign".\n` +
                        `Time left: **${(remainingTime / 1000).toFixed(0)}**s`
                    );
    
                try {
                    await gameMessage.edit({ embeds: [updatedEmbed] });
                } catch (err) {
                    console.error("Error updating countdown embed:", err);
                }
            }, this.COUNTDOWN_INTERVAL); */
    
            // Prepare collectors
            const messageFilter = (m: Message) => m.author.id === currentPlayer.id;
            const buttonFilter = (i: MessageComponentInteraction) =>
                i.customId === "resign_nim" && i.user.id === currentPlayer.id;
    
            const moveCollector = interaction.channel!.createMessageCollector({
                filter: messageFilter,
                time: this.MOVE_TIMEOUT,
            });
    
            const buttonCollector = gameMessage.createMessageComponentCollector({
                filter: buttonFilter,
                max: 1,
                time: this.MOVE_TIMEOUT,
            });
    
            // Tracking flags
            let moveProcessed = false;
            let resigned = false;
    
            // ----- Handle a valid move -----
            moveCollector.on("collect", async (msg) => {
                // Parse the move
                const move = msg.content.trim().split(/[\s,]+/).map(Number);
                if (move.length !== 2 || isNaN(move[0]) || isNaN(move[1])) {
                    await interaction.followUp(
                        `${currentPlayer}, that's an invalid format. Use \`pileIndex numberOfSticks\`.`
                    );
                    return;
                }
    
                const [pileIndex, numberOfSticks] = move;
    
                if (
                    pileIndex < 1 ||
                    pileIndex > piles.length ||
                    numberOfSticks < 1 ||
                    numberOfSticks > piles[pileIndex - 1]
                ) {
                    await interaction.followUp(`${currentPlayer}, that's an invalid move. Please try again.`);
                    return;
                }
    
                // Valid move
                moveProcessed = true;
              //  clearInterval(countdownInterval);
                moveCollector.stop();
                buttonCollector.stop();
    
                // Apply move
                piles[pileIndex - 1] -= numberOfSticks;
    
                // Check if the game is over
                if (piles.every((p) => p === 0)) {
                    // Current player took the last sticks
                    gameInProgress = false;
                    await interaction.followUp(
                        `${currentPlayer} took the last stick(s). ${currentPlayer} wins!`
                    );
                    await this.updateEloRatings(
                        currentPlayer,
                        currentPlayer.id === user1.id ? user2 : user1,
                        interaction,
                        Bot
                    );
                } else {
                    // Switch player
                    currentPlayer = currentPlayer.id === user1.id ? user2 : user1;
                }
            });
    
            // ----- Handle resign -----
            buttonCollector.on("collect", async (i) => {
              //  console.log("IM STUCK2",currentPlayer.username)
                // End the game
                gameInProgress = false;
                resigned = true;
               // clearInterval(countdownInterval);
                moveCollector.stop();
                buttonCollector.stop();
    
                // Disable the button so we can't resign again
                const disabledButton = new ButtonBuilder()
                    .setCustomId("resign_nim")
                    .setLabel("Resign")
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true);
    
                const disabledRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(disabledButton);
    
                await i.update({
                    content: `${currentPlayer.username} has resigned!`,
                    embeds: [],
                    components: [disabledRow as any],
                });
    
                // The other player is the winner
                const winner = currentPlayer.id === user1.id ? user2 : user1;
                await this.updateEloRatings(winner, currentPlayer, interaction, Bot);
    
    
            });
    
            // ----- Handle collector end (timeout, etc.) -----
            moveCollector.on("end", async (collected, reason) => {
                if (reason === "time" && !moveProcessed && !resigned && gameInProgress) {
               //     clearInterval(countdownInterval);
                    gameInProgress = false;
    
                    // Current player took too long, so the other wins
                    await interaction.followUp(
                        `${currentPlayer.username} took too long. ` +
                        `${currentPlayer.id === user1.id ? user2 : user1} wins by timeout!`
                    );
    
                    const winner = currentPlayer.id === user1.id ? user2 : user1;
                    await this.updateEloRatings(winner, currentPlayer, interaction, Bot);
    
                }
            });
    
            // Button collector end (in case it times out with no click)
            buttonCollector.on("end", () => {
                // No special action needed here if no one clicked Resign
                // If the game is already ended, we set that above
            });
    
            // Wait for the collectors to end before checking if we continue
            await new Promise<void>((resolve) => {
                // If either collector ends, we resolve. We could do something more sophisticated
                moveCollector.on("end", () => resolve());
                buttonCollector.on("end", () => resolve());
            });
    
            // Make absolutely sure the countdown is cleared
            // clearInterval(countdownInterval);
    
            // If the game ended (resign, timeout, or final move), break out of loop
            if (!gameInProgress) {
                break;
            }
        }
    }

    async update(userW: User, user: User){
            var ranking = new glicko2.Glicko2();
            let p1s = [await db.get(`${userW!.id}.pointsNIM`),await db.get(`${userW!.id}.rdNIM`),await db.get(`${userW!.id}.volNIM`)];
            let p2s = [await db.get(`${user!.id}.pointsNIM`),await db.get(`${user!.id}.rdNIM`),await db.get(`${user!.id}.volNIM`)];
    
            var p1 = ranking.makePlayer(p1s[0],p1s[1],p1s[2]);
            var p2 = ranking.makePlayer(p2s[0],p2s[1],p2s[2]);
            ranking.updateRatings([[p1,p2,1]]);
          //  console.log(p1s);
          //  console.log("Ryan new rating: " + p1.getRating());
   // console.log("Ryan new rating deviation: " + p1.getRd());
   // console.log("Ryan new volatility: " + p1.getVol());
            await db.set(`${userW!.id}.pointsNIM`,p1.getRating());
            await db.set(`${userW!.id}.rdNIM`,p1.getRd());
            await db.set(`${userW!.id}.volNIM`,p1.getVol());
            await db.set(`${user!.id}.pointsNIM`,p2.getRating());
            await db.set(`${user!.id}.rdNIM`,p2.getRd());
            await db.set(`${user!.id}.volNIM`,p2.getVol());
        }
    

    // Elo rating update
    private async updateEloRatings(
        winner: User,
        loser: User,
        interaction: ChatInputCommandInteraction,
        Bot: Client
    ) {
        

        let arr: [string, number, number][] = [
            [winner.id, (await db.get(`${winner.id}.pointsNIM`))!, 0],
            [loser.id, (await db.get(`${loser.id}.pointsNIM`))!, 0]];
        await this.update(winner,loser);
        arr[0][2] = (await db.get(`${winner.id}.pointsNIM`))!;
        arr[1][2] = (await db.get(`${loser.id}.pointsNIM`))!;
        this.returnLB(interaction, arr);
    }

    private async returnLB(msg: ChatInputCommandInteraction, leaderboardData: [string, number, number][]){
            // Fetch data from database
           // const leaderboardData = await this.fetchLeaderboardData(msg.guild!.id, msg);
    
            // Create and send the embed with pagination
            const embed = this.createLeaderboardEmbed(leaderboardData, 0, msg); // Start at page 0
            const buttons: any = this.createPaginationButtons(0);
            await msg.channel!.send({ embeds: [embed], components: [buttons]});
    
            let currentPage = 0;
    
            const filter = (i: Interaction) => i.isButton() && i.user.id === msg.user.id;
    
            const collector = msg.channel?.createMessageComponentCollector({ filter, time: 60000 }); // 1 minute for interaction
    
            collector?.on('collect', async (i: ButtonInteraction) => {
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
    
        private createPaginationButtons(currentPage: number): ActionRowBuilder {
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`previous_${currentPage}`)  // Embedding the current page number
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === 0),  // Disable if it's the first page
                    new ButtonBuilder()
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
    
        private createLeaderboardEmbed(userArray: [string, number, number][], page: number, msg: ChatInputCommandInteraction): EmbedBuilder {
            const begint = page * 10;
            const endt = Math.min(userArray.length - 1, begint + 9);
            const embed = new EmbedBuilder()
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
}
function swap(user1: User, user2: User): [User, User] {
    return Math.random() < 0.5 ? [user1, user2] : [user2, user1];
}

