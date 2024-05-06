import fetch from 'node-fetch';
import katex from 'katex';

const formatLatex = (string) =>
    string
      .replace(/&#160;/g, " ")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/^\$|\$$|\\\[|\\\]/g, "")
      .replace(/&lt;/g, "\\lt ")
      .replace(/&gt;/g, "\\gt ")
      .replace(/\$/g, "\\$$")
      .replace(/align\*/g, "aligned")
      .replace(/eqnarray\*/g, "aligned")
      .replace(/{tabular}(\[\w\])*/g, "{array}")
      .replace(/\\bold{/g, "\\mathbf{")
      .replace(/\\congruent/g, "\\cong")
      .replace(/\\overarc/g, "\\overgroup")
      .replace(/\\overparen/g, "\\overgroup")
      .replace(/\\underarc/g, "\\undergroup")
      .replace(/\\underparen/g, "\\undergroup")
      .replace(/\\mathdollar/g, "\\$")
      .replace(/\\textdollar/g, "\\$");



const latexer = (html) => {
  html = html.replace(
    /<pre>\s+?(.*?)<\/pre>/gs,
    "<p style='white-space: pre-line;'>$1</p>"
  );

  let images = html.match(/<img (?:.*?) class="latex\w*?" (?:.*?)>/g);
  images = [...new Set(images)];

  if (images) {
    for (let image of images) {
      if (!image.includes("[asy]")) {
        let isDisplay = /alt="\\\[|\\begin/.test(image);
        let imageLatex = formatLatex(image.match(/alt="(.*?)"/)[1]);
        let renderedLatex = katex.renderToString(imageLatex, {
          throwOnError: false,
          displayMode: isDisplay,
        });
        html = html.replaceAll(
          image,
          `<span class="fallback-container">$&</span>` +
            `<katex class="katex-container">${renderedLatex}</katex>`
        );
      }
    }
  }
  return html;
};

import { JSDOM } from 'jsdom';

function getProblem(htmlString) {
    const dom = new JSDOM(htmlString);
    const document = dom.window.document;

    // Remove elements with class .toc and the first <dl> element
    const tocElements = document.querySelectorAll(".toc");
    tocElements.forEach(el => el.remove());
    const firstDl = document.querySelector("dl:first-child");
    if (firstDl) {
        firstDl.remove();
    }

    // Select and process the elements
    let contentElements = Array.from(document.body.children);
    let index = contentElements.findIndex(el => el.tagName.startsWith("H")); // Assuming 'H' for headers like H1, H2, etc.
    contentElements = contentElements.slice(index); // Slice from the first header found

    let outputHTML = contentElements.map(el => el.outerHTML).join("");
    return outputHTML;
}

function getSolutions(htmlString) {
  // Parse the HTML string with jsdom
  const dom = new JSDOM(htmlString);
  const document = dom.window.document;

  // Select all header elements that contain 'Solution' or 'Diagram'
  const headers = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .filter(header => /Solution|Diagram/.test(header.textContent));

  let resultHTML = '';

  headers.forEach(header => {
      let current = header.nextElementSibling;
      while (current && !(/See/.test(current.textContent) || current.tagName.startsWith('H'))) {
          // Check if the current element is not a table and does not contain the specified text
          if (current.tagName !== 'TABLE' && !current.textContent.includes('The problems on this page are copyrighted by the')) {
              resultHTML += current.outerHTML;
          }
          current = current.nextElementSibling;
      }
  });

  return resultHTML;
}

async function getAnswer(yr, vs, problemNum){
  let pagename = `${yr}_AMC_12${vs}_Answer_Key`;

  let apiEndpoint = "https://artofproblemsolving.com/wiki/api.php";
  let params = `action=parse&page=${pagename}&format=json`;
  
    let response = await fetch(`${apiEndpoint}?${params}&origin=*`);

    let json = await response.json();
    let answerText = json.parse?.text["*"];

    if (!answerText) {
        return "No answer text available";
    }

    // Parse the HTML content with jsdom
    const dom = new JSDOM(answerText);
    const document = dom.window.document;

    // Select the 'ol li' elements
    const listItems = document.querySelectorAll('ol li');

    // Find the list item that corresponds to the problem number
    const listItem = listItems[problemNum - 1]; // problemNum - 1 because array is 0-indexed

    // Return the text content of the list item, if available
    return listItem ? listItem.textContent : "No answer found for this problem number";
  
}



const sourceCleanup = (string) =>
    string
      .replace(
        /<span class="fallback-container">.*?<\/span><katex class="katex-container">.*?<annotation encoding="application\/x-tex">(.*?)<\/annotation>.*?<\/katex>/gs,
        "$$$1$$"
      )
      .replace(
        /<span class="mw-headline" id="Problem">Problem<\/span><span class="mw-editsection"><span class="mw-editsection-bracket">\[<\/span><a href=".*?" title="Edit section: Problem">edit<\/a><span class="mw-editsection-bracket">\]<\/span><\/span><\/h2>/g,
        ""
      )
      .replace(/<span class="mw-headline" id=".*?">(.*?)<\/span>/g, "$1")
      .replace(/<span class="mw-editsection">.*?<\/span><\/span>/g, "")
      .replace(/<a.*?>/g, "")
      .replace(/<\/a>/g, "")
      .replace(/<br.*?>/g, "")
      .replace(/<dl>.*?<\/dl>/g, "")
      .replace(/<img.*?>/g, "")
      .replace(/<p>/g, "")
      .replace(/<\/p>/g, "");


      function extractAfterLastH2(inputString) {
        // Find the last occurrence of "<h2>"
        const lastIndex = inputString.lastIndexOf("<h2>");
    
        // If "<h2>" is not found, return an empty string
        if (lastIndex === -1) {
            return "";
        }
    
        // Return the substring after the last "<h2>", excluding "<h2>"
        return inputString.substring(lastIndex + 4);
    }

      function extractProblemText(fullHtml) {
        // Find the first instance of 'Problem'
        const start = fullHtml.indexOf('<h2');
        
        // Find the first instance of '\qquad' which generally marks the end of the first answer choice
        const firstQquad = fullHtml.indexOf('\qquad', start) + '\qquad'.length;
      
        // Use the position of the first '\qquad' to find the first instance of "Solution"
        const solutionIndex = fullHtml.indexOf('<h2>', firstQquad);
        
        // Extract and return the text from 'Problem' to just before 'Solution'
        if (solutionIndex !== -1) {
          return extractAfterLastH2(fullHtml.substring(start, solutionIndex));
        } else {
          // If 'Solution' is not found, return up to the end of the last '\qquad'
          return fullHtml.substring(start, firstQquad);
        }
      }
    
function randint(min ,max) {
  return Math.floor(Math.random()*(max-min+1)+min);
}

export async function randProb(){
  let v = randint(1,2) == 1 ? "A" : "B";
  let yr = randint(2008,2023);
  let probNum = randint(1,25)
  let pagename = `${yr}_AMC_12${v}_Problems/Problem_${probNum}`
  console.log(pagename); 

  let apiEndpoint = "https://artofproblemsolving.com/wiki/api.php";
  let params = `action=parse&page=${pagename}&format=json`;
  
  let OK = false
  while (!OK){
    let response = await fetch(`${apiEndpoint}?${params}&origin=*`);
    let json = await response.json();
    
    if (json?.parse) {
      let problemHTML = latexer(json.parse.text["*"]);
      let fullProblemText = sourceCleanup(getProblem(problemHTML));
      let specificProblemText = extractProblemText(fullProblemText);
      let problemSolutions = sourceCleanup(getSolutions(problemHTML));
      let answer = await getAnswer(yr,v,probNum);
      // Render LaTeX to HTML
    
      if (specificProblemText.length < 20){
        console.log("REDIRECT, TRY AGAIN!?")
      } else {
        console.log(specificProblemText);
       // console.log(problemSolutions);
      //  console.log(answer);
        return [specificProblemText,problemSolutions,answer];
        OK = true;
      }
    } else {
      console.log("TRY AGAIN!?")
    }
  }
}
