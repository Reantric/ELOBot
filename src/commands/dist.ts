import * as Discord from "discord.js";
import { IBotInteraction } from "../api/capi";
//let plotly = require('plotly')('shishirbandy','FkwADIvNqnBgUWLEsVRD');

// @ts-ignore
import plotlyz from "plotly";
const plotly = plotlyz('shishirbandy','FkwADIvNqnBgUWLEsVRD');

import * as fs from "fs";
import { QuickDB } from "quick.db";
const db: QuickDB = new QuickDB();
import { AttachmentBuilder, Client, CommandInteraction } from "discord.js";

export default class dist implements IBotInteraction {

  private readonly aliases = ["dist", "distribution"]

  name(): string {
    return "dist";
  }

  help(): string {
    return "List the distribution of users";
  }

  cooldown(): number {
    return 200;
  }
  isThisInteraction(command: string): boolean {
    return command === "dist";
}

data(): any {
    return new Discord.SlashCommandBuilder()
.setName(this.name())
.setDescription(this.help())
}
perms(): "admin" | "user" | "both" {
    return 'both';
 }
  

  async runCommand(interaction: CommandInteraction, Bot: Client): Promise<void> {
    
    


    // Assuming you've declared and initialized your arrays and 'db' correctly.
    let puri: number[] = []
let seas: number[] = [];
let unhi: number[] = [];
let exp: number[] = [];
let CM: number[] = [];
let Mas : number[]= [];
let IM : number[]= [];
let GM : number[]= [];
let SGM: number[]  = [];
var count = 0;
for (const o of await db.all()) {
  count++;
  if (o.id == process.env.CLIENT_ID) {
      continue;
  }
  const val = await db.get(`${o.id}.points`);

  // Check the ranges and add to the respective array
  if (val >= 0 && val <= 999) {
      puri.push(val);
  } else if (val >= 1000 && val <= 1399) {
      seas.push(val);
  } else if (val >= 1400 && val <= 1799) {
      unhi.push(val);
  } else if (val >= 1800 && val <= 1999) {
      exp.push(val);
  } else if (val >= 2000 && val <= 2199) {
      CM.push(val);
  } else if (val >= 2200 && val <= 2399) {
      Mas.push(val);
  } else if (val >= 2400 && val <= 2499) {
      IM.push(val);
  } else if (val >= 2500 && val <= 2999) {
      GM.push(val);
  } else if (val >= 3000 && val <= 10000) { // assuming 10000 is your logical upper limit
      SGM.push(val);
  }
  // you can add an else block here to handle any cases that don't fall into any of the above categories if necessary
}

var puritan = {
  x: puri,
  type: "histogram",
  name: 'Puritan',
  autobinx: false,
  xbins: {
      start: 0,
      end: 1000,
      size: 100,
      bingroup: "1",
  },
  marker: {
      color: "#A9A9A9",
      line: {

        color:  "#FFFFFF", 
  
        width: 1
  
      }
  }
};



var seasoned = {
    x: seas,
    type: "histogram",
    name: 'Seasoned',
    autobinx: false,
    xbins: {
        start: 1000,
        end: 1400,
        size: 100,
        bingroup: "1",
    },
    marker: {
        color: "#556b2f",
        line: {

            color:  "#FFFFFF", 
      
            width: 1
      
          }
    }
  };

  var unhinged = {
    x: unhi,
    type: "histogram",
    name: 'Unhinged',
    autobinx: false,
    xbins: {
        start:  1400,
        end: 1800,
        size: 100,
        bingroup: "2",
    },
    marker: {
        color: "#00FFFF",
        line: {

            color:  "#FFFFFF", 
      
            width: 1
      
          }
    }
  };

  var expert = {
    x: exp,
    type: "histogram",
    name: 'Expert',
    autobinx: false,
    xbins: {
        start: 1800,
        end: 2000,
        size: 100,
        bingroup: "1",
    },
    marker: {
        color: "#0000ff",
        line: {

            color:  "#FFFFFF", 
      
            width: 1
      
          }
    }
  };

  var CandMas = {
    x: CM,
    type: "histogram",
    name: 'CM',
    autobinx: false,
    xbins: {
        start: 2000,
        end: 2200,
        size: 100,
        bingroup: "1",
    },
    marker: {
        color: "#800080",
        line: {

            color:  "#FFFFFF", 
      
            width: 1
      
          }
    }
  };

  var Master = {
    x: Mas,
    type: "histogram",
    name: 'Master',
    autobinx: false,
    xbins: {
        start: 2200,
        end: 2400,
        size: 100,
        bingroup: "1",
    },
    marker: {
        color: "#FFFF00",
        line: {

            color:  "#FFFFFF", 
      
            width: 1
      
          }
    }
  };

  var IntMas = {
    x: IM,
    type: "histogram",
    name: 'IM',
    autobinx: false,
    xbins: {
        start: 2400,
        end: 2500,
        size: 100,
        bingroup: "1",
    },
    marker: {
        color: "#FFA500",
        line: {

            color:  "#FFFFFF", 
      
            width: 1
      
          }
    }
  };

  var Grandmaster = {
    x: GM,
    type: "histogram",
    name: 'GM',
    autobinx: false,
    xbins: {
        start: 2500,
        end: 3000,
        size: 100,
        bingroup: "1",
    },
    marker: {
        color: "#FF0000",
        line: {

            color:  "#FFFFFF", 
      
            width: 1
      
          }
    }
  };

  var SuperGM = {
    x: SGM,
    type: "histogram",
    name: 'Supremium',
    autobinx: false,
    xbins: {
        start: 3000,
        end: 4000,
        size: 100,
        bingroup: "1",
    },
    marker: {
        color: "#8B0000",
        line: {

            color:  "#FFFFFF", 
      
            width: 1
      
          }
    }
  };

var layout = {
  barmode: "stack",
  title: {
      text: "Hu-man!?",
      font: {
          color: "#FFF",
      },
  },
  xaxis: {
      tickangle: 0,
      title: {
          text: "Hu's ELO",
      },
      showgrid: true,
      zeroline: false,
      color: "#FFFF00",
      tickvals: [0,1000,1200,1400,1600,1800,2000,2200,2400,3000],
      range: [800, 2600]
  },
  yaxis: {
      title: {
          text: "# of users",
      },
      showline: true,
      color: "#BFFF00",
      tickformat: ',d',
      tickfont: {
          size: 35
      }
  },
  paper_bgcolor: "#000000",
  plot_bgcolor: "#000000",
  bargap: 0.05, 
  font: {
      size: 30,
  },
};
var imgOpts = {
  format: 'png',
  width: 1100,
  height: 600
};
var chart = { data: [puritan,seasoned,unhinged,expert,CandMas, Master, IntMas, Grandmaster, SuperGM], layout: layout };
let john= new Promise<void>((resolve,reject) => {
  plotly.getImage(chart, imgOpts, async function (error: any, imageStream: { pipe: (arg0: any) => any; }) {
  if (error) return console.error(reject);
  await imageStream.pipe(fs.createWriteStream('temp/senti.png'));
  })
  resolve();
})  

      interaction.deferReply();
    
      john.then(_ => { // later let discord just take the imageStream itself, no need to save to file
        setTimeout(function() {
        
          const file = new AttachmentBuilder('temp/senti.png'); // replace with your file's path
          interaction.editReply({ content: `Sample size: ${count}`, files: [file] });}
          ,5000);
      });
    
    
  }
}