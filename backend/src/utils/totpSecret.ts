import crypto from 'crypto';

function getTotpKeyHex(): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    // JWT_SECRET is already required elsewhere, but keep this defensive for unit tests.
    throw new Error('JWT_SECRET is required to encrypt TOTP secrets');
  }
  const key = crypto.scryptSync(jwtSecret, 'cloud-shakes-totp', 32);
  return key.toString('hex');
}

export function encryptTotpSecret(secret: string): string {
  if (!secret) return '';
  const keyHex = getTotpKeyHex();
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  cipher.setAAD(Buffer.from('cloud-shakes', 'utf8'));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptTotpSecret(enc: string | null | undefined): string | null {
  if (!enc) return null;
  const parts = enc.split(':');
  if (parts.length !== 3) return null;
  const [ivHex, tagHex, encryptedHex] = parts;
  const keyHex = getTotpKeyHex();
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAAD(Buffer.from('cloud-shakes', 'utf8'));
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

