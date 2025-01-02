import { Client, Role, Interaction, CommandInteraction, User, RoleManager, GuildMemberRoleManager, AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";
import { SlashCommandBuilder } from '@discordjs/builders';
// @ts-ignore
import plotlyz from "plotly";
const plotly = plotlyz('shishirbandy','FkwADIvNqnBgUWLEsVRD');

import { QuickDB } from "quick.db";
import * as fs from "fs";
const db = new QuickDB();
var historia = db.table('history');
import Titles from "../util/Titles.js";

import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

// Define __dirname for ESM modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class history implements IBotInteraction {

    name(): string {
        return "history";
    } 

    help(): string {
        return "View your rating history";
    }   
    
    cooldown(): number{
        return 120;
    }
    isThisInteraction(command: string): boolean {
        return command === "history";
    }

    data(): any {
        return new SlashCommandBuilder()
		.setName(this.name())
		.setDescription(this.help())
        .addUserOption((option:any) => option.setName('target').setDescription('Select a user'));
    }
    perms(): "admin" | "user" | "both" {
        return 'both';
    }


    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        interaction.deferReply();
        let user = interaction.options.getUser('target');
        if (!user) {
            user = interaction.user;
        }
        
        const hist = await historia.get(`${user.id}.NIM`);
        console.log(hist);
        var trace2 = {
  
          y: hist,
        
          type: "scatter",
          line: {
              color: '#FFFFFF', // Choose the color you want for the line.
              width: 5, // This makes the line thicker, increasing its visibility.
              opacity: 1
            },
            marker: {
              size: 11, // Adjust the size as needed for visibility.
              color: 'white', // The color of the marker, can be customized.
              line: {
                color: 'white', // Border color for the marker, can be customized.
                width: 2 // Border width of the marker, can be adjusted.
              }
            }
        
        
        };
  
        let rank_boundaries = [];
  
        for (const x of Titles.Title) {
          rank_boundaries.push({
            type: 'rect',
            xref: 'paper',
            yref: 'y',
            x0: 0,
            x1: 1,
            y0: x[2][0],  // assuming your y-axis starts at this value
            y1: x[2][1],  // mid-point
            fillcolor: x[4],  // or any color you prefer
            opacity: 0.35,
            line: {
              width: 0
            }
          });
        }      
        
        var layout = {
      
          title: {
            text: `${user.username}'s History`,
            font: {
                color: "#FFF",
            },
        },
        
          xaxis: {
              tickangle: 0,
              title: {
                  text: "Problems Solved",
              },
              showgrid: true,
              zeroline: false,
              color: "#FFFF00",
              //tickvals: [0,5,10,15,20],
              tickfont: {
                  size: 25
              },
              //range: [0,20]
          },
          yaxis: {
              title: {
                  text: "",
              },
              showline: true,
              color: "#BFFF00",
              tickformat: ',d',
              tickfont: {
                  size: 25
              },range: [0,Math.max(...hist)+200]
          },
          
        paper_bgcolor: "#000000",
        plot_bgcolor: "#000000",
        shapes: rank_boundaries
        };
  
     // const plotData = [trace2];
  
      try {
          // Launch Puppeteer
          const browser = await puppeteer.launch({
              headless: true,
              // Uncomment and set the path if you want to use an existing Chrome installation
              // executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
              args: ['--no-sandbox', '--disable-setuid-sandbox'],
              timeout: 60000 // Optional: Increase timeout if needed
          });
          const page = await browser.newPage();
  
          // Define the HTML content with embedded Plotly script
          const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
              <meta charset="utf-8">
              <title>Plotly Chart</title>
              <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
          </head>
          <body style="margin:0; padding:0; background-color:#000000;">
              <div id="plot" style="width:1100px; height:600px;"></div>
              <script>
                  const hist = ${JSON.stringify(hist)};
                  const trace = ${JSON.stringify(trace2)};
                  const layout = ${JSON.stringify(layout)};
                  Plotly.newPlot('plot', [trace], layout).then(() => {
                      // Notify Puppeteer that the plot is ready
                      window.plotReady = true;
                  });
              </script>
          </body>
          </html>
          `;
  
          // Set the page content
          await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  
          // Wait until the plot is ready
          await page.waitForFunction('window.plotReady === true', { timeout: 60000 });
  
          // Capture the plot div as an image
          const plotElement = await page.$('#plot');
          if (!plotElement) {
              throw new Error('Plot element not found on the page.');
          }
        //  let imageBuffer = await plotElement.screenshot({ omitBackground: true });
        //imageBuffer = Buffer.from(await plotElement.screenshot({ omitBackground: true }));
        const imageBuffer = Buffer.from(await plotElement.screenshot({ omitBackground: true }));
          
        const imageAttachment = new AttachmentBuilder(imageBuffer as any, { name: 'hist.png' });

        // Then reply with the attachment
        await interaction.editReply({
        files: [imageAttachment],
        });

          // Close Puppeteer
          await browser.close();
  
          /* // Ensure the 'temp' directory exists
          const tempDir = path.join(__dirname, '../temp');
          if (!fs.existsSync(tempDir)) {
              fs.mkdirSync(tempDir);
          }
  
          // Define the image path
          const imagePath = path.join(tempDir, 'hist.png');
  
          // Save the image to the file system
          fs.writeFileSync(imagePath, imageBuffer);
          console.log(`Plot image saved successfully at ${imagePath}`);
          */
      } catch (error) {
          console.error('Error generating Plotly image with Puppeteer:', error);
      }
       
    }
}
