import fetch from 'node-fetch';
import 'dotenv/config';

export async function uploadToPastebin(pgpBlob: string) {
  const gistData = {
    description: "PGP Signed Message",
    public: false, // private gist
    files: {
      "signed_message.txt": {
        content: pgpBlob
      }
    }
  };

  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      'Authorization': `token ${process.env.GIST_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ELOBot'
    },
    body: JSON.stringify(gistData)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GitHub API error: ${res.status} - ${errorText}`);
  }

  const responseData = await res.json() as { html_url: string };
  return responseData.html_url; // Returns the full GitHub Gist URL
}