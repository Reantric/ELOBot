// npm install openpgp @types/node
import * as openpgp from 'openpgp';
import { readFile } from 'fs/promises';

export async function signAndVerifyMessage(messageText: string): Promise<{ signed: string; isValid: boolean; verifiedMessage: string }> {
  try {
    // 1) load keys
    const publicKeyArmored  = await readFile("temp/pkey.txt", 'utf8');
    const privateKeyArmored = await readFile('temp/skey.txt', 'utf8');
    
    // 2) parse keys with relaxed security for weak keys
    const publicKey  = await openpgp.readKey({ armoredKey: publicKeyArmored });
    const privateKey = await openpgp.readPrivateKey({ 
      armoredKey: privateKeyArmored,
      config: { rejectHashAlgorithms: new Set(), rejectMessageHashAlgorithms: new Set(), minRSABits: 1024 }
    });
    
    // If your private key is passphrase‑protected, decrypt it:
    const decryptedPrivateKey = await openpgp.decryptKey({
      privateKey,
      passphrase: 'mogged'
    });
    
    // 3) sign
    const signed = await openpgp.sign({
      message: await openpgp.createCleartextMessage({ text: messageText }),
      signingKeys: decryptedPrivateKey,
      config: { rejectHashAlgorithms: new Set(), rejectMessageHashAlgorithms: new Set(), minRSABits: 1024 }
    });
    
    console.log(signed);  // ASCII‑armoured clearsigned message
    
    // 4) verify
    const verification = await openpgp.verify({
      message: await openpgp.readCleartextMessage({ cleartextMessage: signed }),
      verificationKeys: publicKey,
      config: { rejectHashAlgorithms: new Set(), rejectMessageHashAlgorithms: new Set(), minRSABits: 1024 }
    });
    
    const isValid = await verification.signatures[0].verified;
    const verifiedMessage = verification.data;
    
    console.log('Signature valid:', isValid);
    console.log('Verified message:', verifiedMessage);
    
    return {
      signed,
      isValid,
      verifiedMessage
    };
    
  } catch (error) {
    console.error('PGP signing/verification failed:', error);
    return {
      signed: '',
      isValid: false,
      verifiedMessage: ''
    };
  }
}

