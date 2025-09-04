import { spawn } from 'child_process';
/**
 * Calls the Python script and returns the generated text.
 * @param inputText - The input prompt for the model.
 * @returns {Promise<string>} - The generated response.
 */
export function generateResponse(inputText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', ['-W', 'ignore', 'src/util/UserEmulator/use.py']);
    let output = '';
    let errorOutput = '';

    py.stdout.on('data', (data) => {
      output += data.toString();
    });
    py.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    py.on('error', (err) => {
      errorOutput += String(err?.message || err);
    });

    py.on('close', (code) => {
      if (code !== 0) {
        console.error('Python stderr:', errorOutput);
        reject('An error occurred while generating a response.');
      } else {
        resolve(output.trim());
      }
    });

    try {
      py.stdin.write(inputText);
      py.stdin.end();
    } catch (e) {
      reject('Failed to send prompt to Python process.');
    }
  });
}
