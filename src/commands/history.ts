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


    // this could definitely be improved via for loops and using Title
    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        let user = interaction.options.getUser('target');
        if (!user) {
            user = interaction.user;
        }
        
        const hist = await historia.get(user.id);
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
          shapes: [
            // First colored region
            {
              type: 'rect',
              xref: 'paper',
              yref: 'y',
              x0: 0,
              x1: 1,
              y0: 0,  // assuming your y-axis starts at this value
              y1: 1000,  // mid-point
              fillcolor: '#A9A9A9',  // or any color you prefer
              opacity: 0.35,
              line: {
                width: 0
              }
            },
            // Second colored region
            {
                type: 'rect',
                xref: 'paper',
                yref: 'y',
                x0: 0,
                x1: 1,
                y0: 1000,  // assuming your y-axis starts at this value
                y1: 1400,  // mid-point
                fillcolor: 'green',  // or any color you prefer
                opacity: 0.35,
                line: {
                  width: 0
                }
              },
              {
                type: 'rect',
                xref: 'paper',
                yref: 'y',
                x0: 0,
                x1: 1,
                y0: 1400,  // assuming your y-axis starts at this value
                y1: 1800,  // mid-point
                fillcolor: '#00FFFF',  // or any color you prefer
                opacity: 0.35,
                line: {
                  width: 0
                }
              },
              {
                type: 'rect',
                xref: 'paper',
                yref: 'y',
                x0: 0,
                x1: 1,
                y0: 1800,  // assuming your y-axis starts at this value
                y1: 2000,  // mid-point
                fillcolor: '#0000ff',  // or any color you prefer
                opacity: 0.35,
                line: {
                  width: 0
                }
              },
              {
                type: 'rect',
                xref: 'paper',
                yref: 'y',
                x0: 0,
                x1: 1,
                y0: 2000,  // assuming your y-axis starts at this value
                y1: 2200,  // mid-point
                fillcolor: 'magenta',  // or any color you prefer
                opacity: 0.35,
                line: {
                  width: 0
                }
              },
              {
                type: 'rect',
                xref: 'paper',
                yref: 'y',
                x0: 0,
                x1: 1,
                y0: 2200,  // assuming your y-axis starts at this value
                y1: 2400,  // mid-point
                fillcolor: '#FFFF00',  // or any color you prefer
                opacity: 0.35,
                line: {
                  width: 0
                }
              },
              {
                type: 'rect',
                xref: 'paper',
                yref: 'y',
                x0: 0,
                x1: 1,
                y0: 2400,  // assuming your y-axis starts at this value
                y1: 2500,  // mid-point
                fillcolor: '#FFA500',  // or any color you prefer
                opacity: 0.35,
                line: {
                  width: 0
                }
              },
              {
                type: 'rect',
                xref: 'paper',
                yref: 'y',
                x0: 0,
                x1: 1,
                y0: 2500,  // assuming your y-axis starts at this value
                y1: 3000,  // mid-point
                fillcolor: '#FF0000',  // or any color you prefer
                opacity: 0.35,
                line: {
                  width: 0
                }
              },
              {
                type: 'rect',
                xref: 'paper',
                yref: 'y',
                x0: 0,
                x1: 1,
                y0: 3000,  // assuming your y-axis starts at this value
                y1: 5000,  // mid-point
                fillcolor: '#8B0000',  // or any color you prefer
                opacity: 0.35,
                line: {
                  width: 0
                }
              }
          ],
          
          };
        
        var imgOpts = {
          format: 'png',
          width: 1100,
          height: 600
        };
        var chart = { data: [trace2], layout: layout };
        let john= new Promise<void>((resolve,reject) => {
          plotly.getImage(chart, imgOpts, async function (error: any, imageStream: { pipe: (arg0: any) => any; }) {
          if (error) return console.error(reject);
          await imageStream.pipe(fs.createWriteStream('temp/hist.png'));
          })
          resolve();
        })

        interaction.deferReply();
    
      john.then(_ => {
        setTimeout(function() {
        
          const file = new AttachmentBuilder('temp/hist.png'); // replace with your file's path
          interaction.editReply({files: [file] });}
          ,5000);
      });
       
    }
}
