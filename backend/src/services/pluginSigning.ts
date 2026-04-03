import { randomBytes, createHash } from 'crypto';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import prisma from '../config/db';

const SIGNING_KEY_ID = process.env.SIGNING_KEY_ID || 'default-signing-key';
const ROOT_KEY_ID = process.env.ROOT_KEY_ID || 'root-key';

interface KeyPairData {
  publicKey: string;
  privateKey: string;
}

let cachedKeyPair: KeyPairData | null = null;

export async function getOrCreateSigningKey(): Promise<any> {
  let signingKey = await prisma.signingKey.findUnique({
    where: { keyId: SIGNING_KEY_ID }
  });

  if (!signingKey) {
    const keyPairData = generateKeyPair();
    
    signingKey = await prisma.signingKey.create({
      data: {
        keyId: SIGNING_KEY_ID,
        publicKey: keyPairData.publicKey,
        type: 'signing',
        isActive: true
      }
    });

    cachedKeyPair = keyPairData;
  }

  return signingKey;
}

export async function getOrCreateRootKey(): Promise<any> {
  let rootKey = await prisma.signingKey.findUnique({
    where: { keyId: ROOT_KEY_ID }
  });

  if (!rootKey) {
    const keyPairData = generateKeyPair();
    
    rootKey = await prisma.signingKey.create({
      data: {
        keyId: ROOT_KEY_ID,
        publicKey: keyPairData.publicKey,
        type: 'root',
        isActive: true
      }
    });
  }

  return rootKey;
}

function generateKeyPair(): KeyPairData {
  const keyPair = nacl.sign.keyPair();
  
  return {
    publicKey: encodeBase64(keyPair.publicKey),
    privateKey: encodeBase64(keyPair.secretKey)
  };
}

export async function signData(data: string): Promise<string> {
  if (!cachedKeyPair) {
    const signingKey = await getOrCreateSigningKey();
    cachedKeyPair = {
      publicKey: signingKey.publicKey,
      privateKey: signingKey.privateKey || ''
    };
  }

  const message = decodeUTF8(data);
  const privateKeyBuffer = decodeBase64(cachedKeyPair.privateKey);
  const signature = nacl.sign.detached(message, privateKeyBuffer);
  
  return encodeBase64(signature);
}

export async function signHash(hash: string): Promise<string> {
  const signingKey = await getOrCreateSigningKey();
  const privateKeyHex = process.env.SIGNING_PRIVATE_KEY || '';
  
  if (!signingKey.privateKey && !privateKeyHex) {
    const keyPairData = generateKeyPair();
    cachedKeyPair = keyPairData;
    
    await prisma.signingKey.update({
      where: { keyId: SIGNING_KEY_ID },
      data: { privateKey: keyPairData.privateKey }
    });
    
    const hashBuffer = decodeBase64(hash);
    const privateKeyBuffer = decodeBase64(keyPairData.privateKey);
    const signature = nacl.sign.detached(hashBuffer, privateKeyBuffer);
    return encodeBase64(signature);
  }

  const privateKey = privateKeyHex || signingKey.privateKey;
  const hashBuffer = decodeBase64(hash);
  const privateKeyBuffer = decodeBase64(privateKey);
  const signature = nacl.sign.detached(hashBuffer, privateKeyBuffer);
  
  return encodeBase64(signature);
}

export function verifySignature(data: string, signature: string, publicKeyBase64: string): boolean {
  try {
    const message = decodeUTF8(data);
    const signatureBuffer = decodeBase64(signature);
    const publicKeyBuffer = decodeBase64(publicKeyBase64);
    
    return nacl.sign.detached.verify(message, signatureBuffer, publicKeyBuffer);
  } catch {
    return false;
  }
}

export function verifyHashSignature(hash: string, signature: string, publicKeyBase64: string): boolean {
  try {
    const hashBuffer = decodeBase64(hash);
    const signatureBuffer = decodeBase64(signature);
    const publicKeyBuffer = decodeBase64(publicKeyBase64);
    
    return nacl.sign.detached.verify(hashBuffer, signatureBuffer, publicKeyBuffer);
  } catch {
    return false;
  }
}

export function calculateSHA256(fileBuffer: Buffer): string {
  return createHash('sha256').update(fileBuffer).digest('hex');
}

export async function signPlugin(hash: string, versionId: string): Promise<string> {
  const signingKey = await getOrCreateSigningKey();
  const signature = await signHash(hash);
  
  await prisma.pluginSignature.create({
    data: {
      versionId,
      keyId: signingKey.keyId,
      signature
    }
  });
  
  return signature;
}

export async function revokeKey(keyId: string): Promise<void> {
  await prisma.signingKey.update({
    where: { keyId },
    data: {
      isActive: false,
      revokedAt: new Date()
    }
  });
}

export async function rotateSigningKey(): Promise<any> {
  const currentKey = await prisma.signingKey.findUnique({
    where: { keyId: SIGNING_KEY_ID }
  });

  if (currentKey) {
    await prisma.signingKey.update({
      where: { keyId: SIGNING_KEY_ID },
      data: {
        isActive: false,
        revokedAt: new Date()
      }
    });
  }

  const newKeyPair = generateKeyPair();
  const rootKey = await getOrCreateRootKey();
  
  const newSigningKey = await prisma.signingKey.create({
    data: {
      keyId: `${SIGNING_KEY_ID}-${Date.now()}`,
      publicKey: newKeyPair.publicKey,
      type: 'signing',
      parentKeyId: rootKey.keyId,
      isActive: true
    }
  });

  cachedKeyPair = newKeyPair;
  
  return newSigningKey;
}

export async function getActiveSigningKeys(): Promise<any[]> {
  return prisma.signingKey.findMany({
    where: {
      isActive: true,
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    },
    orderBy: { createdAt: 'desc' }
  });
}
