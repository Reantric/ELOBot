import { exec } from 'child_process';

/**
 * Calls the Python script and returns the generated text.
 * @param inputText - The input prompt for the model.
 * @returns {Promise<string>} - The generated response.
 */
export async function generateResponse(inputText: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(`python3 -W ignore src/util/UserEmulator/use.py "${inputText}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing Python script: ${error.message}`);
                reject("An error occurred while generating a response.");
                return;
            }
            if (stderr) {
                //console.warn(`Python script stderr: ${stderr}`);
            }
            resolve(stdout.trim()); // Trim whitespace to clean up response
        });
    });
}
