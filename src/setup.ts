import * as fs from 'fs';
import path from 'path';

// Compute the directory name of the current module file
const __dirname = import.meta.dirname;

// Use path.join to construct paths for directories
var commandFiles = fs.readdirSync(path.join(__dirname, 'commands'));
var eventFiles = fs.readdirSync(path.join(__dirname, 'events'));
var reactFiles = fs.readdirSync(path.join(__dirname, 'reacts'));

export let setupInfo = {
    //"prefix": "!",  // Uncomment if you need to use a prefix for commands
    "commands": commandFiles,
    "events": eventFiles,
    "reacts": reactFiles,
    "guildID": "1029199405657620500"
};
