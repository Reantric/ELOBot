import { promises, existsSync, mkdirSync } from 'fs';
const fsPromises = promises;
import pkg from 'shelljs';
const { exec } = pkg;
import express from 'express';
import promiseRouter from 'express-promise-router';
import queue from 'express-queue';
import sharp from 'sharp';
import Promise from 'bluebird';

const port = 3001;

const staticDir = 'static';
const tempDir = 'temp';
const outputDir = 'tex';
const httpOutputDir = 'tex';

// Checklist of valid formats from the frontend, to verify form values are correct
const validFormats = ['SVG', 'PNG', 'JPG'];

// Maps scales received from the frontend into values appropriate for LaTeX
const scaleMap = {
  '10%': '0.1',
  '25%': '0.25',
  '50%': '0.5',
  '75%': '0.75',
  '100%': '1.0',
  '125%': '1.25',
  '150%': '1.5',
  '200%': '2.0',
  '500%': '5.0',
  '1000%': '10.0'
};

// Unsupported commands we will error on
const unsupportedCommands = ['\\usepackage', '\\input', '\\include', '\\write18', '\\immediate', '\\verbatiminput'];

const app = express();

import pkg1 from 'body-parser';
const { json, urlencoded } = pkg1;

app.use(json());
app.use(urlencoded({ extended: true }));

// Allow static html files and output files to be accessible
app.use('/', express.static(staticDir));
app.use('/output', express.static(outputDir));

const conversionRouter = promiseRouter();
app.use(conversionRouter);

// Queue requests to ensure that only one is processed at a time, preventing
// multiple concurrent Docker containers from exhausting system resources
conversionRouter.use(queue({ activeLimit: 1, queuedLimit: -1 }));

// Conversion request endpoint
conversionRouter.post('/convert', async (req, res) => {
  const id = generateID(); // Generate a unique ID for this request

  try {
    if (!req.body.latexInput) {
      res.end(JSON.stringify({ error: 'No LaTeX input provided.' }));
      return;
    }

    if (!scaleMap[req.body.outputScale]) {
      res.end(JSON.stringify({ error: 'Invalid scale.' }));
      return;
    }

    if (!validFormats.includes(req.body.outputFormat)) {
      res.end(JSON.stringify({ error: 'Invalid image format.' }));
      return;
    }

    const unsupportedCommandsPresent = unsupportedCommands.filter(cmd => req.body.latexInput.includes(cmd));
    if (unsupportedCommandsPresent.length > 0) {
      res.end(JSON.stringify({ error: `Unsupported command(s) found: ${unsupportedCommandsPresent.join(', ')}. Please remove them and try again.` }));
      return;
    }

    const equation = req.body.latexInput.trim();
    const fileFormat = req.body.outputFormat.toLowerCase();
    const outputScale = scaleMap[req.body.outputScale];

    // Generate and write the .tex file
    await fsPromises.mkdir(`${tempDir}/${id}`);
    await fsPromises.writeFile(`${tempDir}/${id}/equation.tex`, getLatexTemplate(equation));

    // Run the LaTeX compiler and generate a .svg file
    await execAsync(getDockerCommand(id, outputScale));

    const inputSvgFileName = `${tempDir}/${id}/equation.svg`;
    const outputFileName = `${outputDir}/img-${id}.${fileFormat}`;

    // Return the SVG image, no further processing required
    if (fileFormat === 'svg') {
      await fsPromises.copyFile(inputSvgFileName, outputFileName);

    // Convert to PNG
    } else if (fileFormat === 'png') {
      await sharp(inputSvgFileName, { density: 360 }).extend({
        top: 50,
        bottom: 50,
        left: 50,
        right: 50,
        background: { r: 255, g: 255, b: 255, alpha: 1 }  // adjust background color if necessary
    }).toFile(outputFileName); // Sharp's PNG type is implicitly determined via the output file extension

    // Convert to JPG
    } else {
      await sharp(inputSvgFileName, { density: 360 }).extend({
        top: 50,
        bottom: 50,
        left: 50,
        right: 50,
        background: { r: 255, g: 255, b: 255, alpha: 1 }  // adjust background color if necessary
    }).flatten({ background: { r: 255, g: 255, b: 255 } }) // as JPG is not transparent, use a white background
        .jpeg({ quality: 95 })
        .toFile(outputFileName);
    }

    await cleanupTempFilesAsync(id);
    res.end(JSON.stringify({ imageURL: `${httpOutputDir}/img-${id}.${fileFormat}` }));

  // An exception occurred somewhere, return an error
  } catch (e) {
    console.error(e);
    await cleanupTempFilesAsync(id);
    res.end(JSON.stringify({ error: 'Error converting LaTeX to image. Please ensure the input is valid.' }));
  }
});

// Create temp and output directories if they don't exist yet
if (!existsSync(tempDir)) {
  mkdirSync(tempDir);
}
if (!existsSync(outputDir)) {
  mkdirSync(outputDir);
}

// Start the server
app.listen(port, () => console.log(`Latex2Image listening at http://localhost:${port}`));

//// Helper functions

// Get the LaTeX document template for the requested equation

function getLatexTemplate(equation) {
  return String.raw `
    \documentclass[12pt]{article}
    \usepackage{amsmath}
    \usepackage{amssymb}
    \usepackage{amsfonts}
    \usepackage{xcolor}
    \usepackage{siunitx}
    \usepackage[utf8]{inputenc}
    \thispagestyle{empty}
    \everymath{\displaystyle}
    \let\oldleq\leq
    \renewcommand{\leq}{\leqslant}
    \let\oldle\le
    \renewcommand{\le}{\leqslant}
    \let\oldgeq\geq
    \renewcommand{\geq}{\geqslant}
    \let\oldge\ge
    \renewcommand{\ge}{\geqslant}
    \newcommand{\lt}{<}
    \newcommand{\gt}{>}
    \begin{document}
    ${equation}
    \end{document}`;
}

// Get the final command responsible for launching the Docker container and generating a svg file
function getDockerCommand(id, output_scale) {
  // Commands to run within the container
  const containerCmds = `
    # Prevent LaTeX from reading/writing files in parent directories
    echo 'openout_any = p\nopenin_any = p' > /tmp/texmf.cnf
    export TEXMFCNF='/tmp:'

    # Compile .tex file to .dvi file. Timeout kills it after 5 seconds if held up
    timeout 5 latex -no-shell-escape -interaction=nonstopmode -halt-on-error equation.tex

    # Convert .dvi to .svg file. Timeout kills it after 5 seconds if held up
    timeout 5 dvisvgm --no-fonts --scale=${output_scale} --exact equation.dvi`;

  // Start the container in the appropriate directory and run commands within it.
  // Files in this directory will be accessible under /data within the container.
  return `
    cd ${tempDir}/${id}
    docker run --rm -i --user="$(id -u):$(id -g)" \
        --net=none -v "$PWD":/data "blang/latex:ubuntu" \
        /bin/bash -c "${containerCmds}"`;
}

// Deletes temporary files created during a conversion request
function cleanupTempFilesAsync(id) {
  fsPromises.rm(`${tempDir}/${id}`, { recursive: true, force: true });
}

// Execute a shell command
function execAsync(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, opts, (code, stdout, stderr) => {
      if (code != 0) reject(new Error(stderr));
      else resolve(stdout);
    });
  });
}

function generateID() {
  // Generate a random 16-char hexadecimal ID
  let output = '';
  for (let i = 0; i < 16; i++) {
    output += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
  }
  return output;
}


import axios from 'axios';

async function convertLatexToImage(latexInput, outputFormat, outputScale) {
    const apiUrl = 'http://localhost:3001/convert';
    const requestBody = {
        latexInput: latexInput,
        outputFormat: outputFormat,
        outputScale: outputScale
    };

    try {
        const response = await axios.post(apiUrl, requestBody);
        return response.data.imageURL;
      //  console.log('Image URL:', response.data.imageURL);
    } catch (error) {
        console.error('Error converting LaTeX:', error.response ? error.response.data : error.message);
    }
}

// Convert "Hello, $x^2$" to an image
/*let ltf = String.raw `Let $h_n$ and $k_n$ be the unique relatively prime positive integers such that $\frac{1}{1}+\frac{1}{2}+\frac{1}{3}+\cdots+\frac{1}{n}=\frac{h_n}{k_n}.$ Let $L_n$ denote the least common multiple of the numbers $1, 2, 3, \ldots, n$. For how many integers with $1\le{n}\le{22}$ is $k_n \lt L_n$?
$\textbf{(A) }0 \qquad\textbf{(B) }3 \qquad\textbf{(C) }7 \qquad\textbf{(D) }8\qquad\textbf{(E) }10$`;
console.log(ltf);
convertLatexToImage(ltf, 'JPG', '100%'); */


export default convertLatexToImage;