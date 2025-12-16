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
import { markToMarket } from '../util/trading/portfolio.js';
import { formatPercentage, formatCurrency } from '../util/trading/view.js';

// Define __dirname for ESM modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TWR_RANGES: { name: string; min: number; max: number; color: string }[] = [
    { name: 'Easy', min: Number.NEGATIVE_INFINITY, max: -10, color: '#75F347' },
    { name: 'Medium', min: -10, max: 0, color: '#FFFE00' },
    { name: 'Hard', min: 0, max: 10, color: '#FD7C00' },
    { name: 'Difficult', min: 10, max: 25, color: '#FF3232' },
    { name: 'Challenging', min: 25, max: 40, color: '#A00000' },
    { name: 'Intense', min: 40, max: 60, color: '#19232D' },
    { name: 'Remorseless', min: 60, max: 100, color: '#C800C8' },
    { name: 'Insane', min: 100, max: 150, color: '#0000FF' },
    { name: 'Extreme', min: 150, max: 300, color: '#0389FF' },
    { name: 'Terrifying', min: 300, max: 600, color: '#00FFFF' },
    { name: 'Terrifyting', min: 600, max: 1500, color: '#FF66FF' },
    { name: 'Catastrophic', min: 1500, max: Number.POSITIVE_INFINITY, color: '#FFFFFF' },
];

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
        .addUserOption((option:any) => option.setName('target').setDescription('Select a user'))
        .addStringOption((option: any) =>
            option
                .setName('lbtype')
                .setDescription('Which rating history to show')
                .addChoices(
                    { name: 'NIM', value: 'NIM' },
                    { name: 'AOPS', value: 'AOPS' },
                    { name: 'Market', value: 'MARKET' },
                )
        );
    }
    perms(): "admin" | "user" | "both" {
        return 'both';
    }


    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        await interaction.deferReply();
        let user = interaction.options.getUser('target');
        const lbtype = (interaction.options.getString('lbtype') || 'NIM') as 'NIM' | 'AOPS' | 'MARKET';
        if (!user) {
            user = interaction.user;
        }

        let hist: number[] = [];
        let twrDisplay: string | null = null;

        let latestNetWorth: number | null = null;
        let valuation: Awaited<ReturnType<typeof markToMarket>> | null = null;

        if (lbtype === 'MARKET') {
            valuation = await markToMarket(user.id, true);
            const netHistory = valuation.account.netWorthHistory ?? [];
            if (!netHistory.length) {
                await interaction.editReply({ content: `No market history found for ${user.username}.` });
                return;
            }
            hist = netHistory.map(point => ((point.cumulativeReturn ?? 0) * 100));
            twrDisplay = formatPercentage(valuation.twr ?? 0);
            latestNetWorth = valuation.netWorth;
        } else {
            const rawHist = await historia.get(`${user.id}.${lbtype}`);
            if (!rawHist || !Array.isArray(rawHist) || rawHist.length === 0) {
                await interaction.editReply({ content: `No ${lbtype} history found for ${user.username}.` });
                return;
            }
            hist = rawHist;
        }

        const isMarket = lbtype === 'MARKET';

        const xValues = (() => {
            if (isMarket && valuation) {
                const baseTimestamp = valuation.account.netWorthHistory[0]?.timestamp ?? Date.now();
                return valuation.account.netWorthHistory.map(point => {
                    const diff = point.timestamp - baseTimestamp;
                    const days = Math.round(diff / (1000 * 60 * 60 * 24));
                    return Math.max(0, days);
                });
            }
            return hist.map((_, idx) => idx);
        })();

        const trace2 = {
            x: xValues,
            y: hist,
            type: "scatter",
            mode: 'lines',
            line: {
                color: isMarket ? '#4FD1C5' : '#FFFFFF',
                width: 5,
                opacity: 1
            },
            marker: {
                size: 8,
                color: isMarket ? '#4FD1C5' : '#FFFFFF',
                line: {
                    color: isMarket ? '#4FD1C5' : '#FFFFFF',
                    width: 2
                }
            },
            fill: 'tozeroy',
            fillcolor: isMarket ? 'rgba(79, 209, 197, 0.12)' : 'rgba(255, 255, 255, 0.08)'
        };

        const chartMax = hist.length ? Math.max(...hist, 0) : 0;
        const chartMin = hist.length ? Math.min(...hist, 0) : 0;
        const buffer = Math.max(Math.abs(chartMax - chartMin) * 0.1, 5);
        const yRange = [chartMin - buffer, chartMax + buffer];

        let rank_boundaries: any[] = [];
        if (isMarket) {
            rank_boundaries = TWR_RANGES.map(range => {
                const y0 = range.min === Number.NEGATIVE_INFINITY ? yRange[0] : range.min;
                const y1 = range.max === Number.POSITIVE_INFINITY ? yRange[1] : range.max;
                if (y1 < yRange[0] || y0 > yRange[1]) {
                    return null;
                }
                return {
                    type: 'rect',
                    xref: 'paper',
                    yref: 'y',
                    x0: 0,
                    x1: 1,
                    y0,
                    y1,
                    fillcolor: range.color,
                    opacity: 0.20,
                    line: { width: 0 }
                };
            }).filter(Boolean) as any[];
        } else {
            rank_boundaries = Titles.Title.map(x => ({
                type: 'rect',
                xref: 'paper',
                yref: 'y',
                x0: 0,
                x1: 1,
                y0: x[2][0],
                y1: x[2][1],
                fillcolor: x[4],
                opacity: 0.35,
                line: { width: 0 }
            }));
        }

        const layout: any = {
            title: {
                text: isMarket
                    ? `${user.username}'s TWR History${twrDisplay ? ` • Current ${twrDisplay}` : ''}`
                    : `${user.username}'s ${lbtype} History`,
                font: {
                    color: "#FFFFFF",
                },
            },
            xaxis: {
                tickangle: 0,
                title: {
                    text: isMarket ? 'Days Since Start' : 'Problems Solved',
                },
                showgrid: true,
                zeroline: false,
                color: "#F0F0F0",
                tickfont: {
                    size: 18
                },
            },
            yaxis: {
                title: {
                    text: isMarket ? 'TWR (%)' : '',
                },
                showline: true,
                color: "#F0F0F0",
                tickformat: isMarket ? ',.0f' : ',d',
                tickfont: {
                    size: 18
                },
                range: isMarket
                    ? yRange
                    : [0, Math.max(...hist) + 200]
            },
            paper_bgcolor: "#2f3136",
            plot_bgcolor: "#2f3136",
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
          <body style="margin:0; padding:0; background-color:#2f3136;">
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
        const payload: any = {
            files: [imageAttachment],
        };
        if (isMarket) {
            const lastValue = hist.length ? hist[hist.length - 1] : 0;
            const twrText = twrDisplay ?? formatPercentage(lastValue / 100);
            const worthText = latestNetWorth != null ? formatCurrency(latestNetWorth) : 'N/A';
            payload.content = `Net Worth: ${worthText} • TWR: ${twrText}`;
        }
        await interaction.editReply(payload);

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
