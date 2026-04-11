import crypto from 'crypto';
import prisma from '../config/db.js';

const LOCAL_INSTANCE_ID = 'local-plugin-license';
const CIPHER = 'aes-256-gcm';

function getMasterKey(): Buffer {
  const raw = process.env.PLUGIN_LICENSE_MASTER_KEY || process.env.JWT_SECRET || 'cloud-shakes-plugin-license-dev-key';
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const key = getMasterKey();
  const cipher = crypto.createCipheriv(CIPHER, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted payload');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');
  const key = getMasterKey();
  const decipher = crypto.createDecipheriv(CIPHER, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plain.toString('utf8');
}

class PluginLicenseService {
  async getLicenseKey(): Promise<string | null> {
    const record = await prisma.instanceLicense.findUnique({
      where: { instanceId: LOCAL_INSTANCE_ID },
    });

    if (!record?.licenseKey) {
      return null;
    }

    try {
      return decrypt(record.licenseKey);
    } catch (error) {
      console.error('[PluginLicenseService] Failed to decrypt license:', error);
      return null;
    }
  }

  async setLicenseKey(licenseKey: string): Promise<void> {
    const encrypted = encrypt(licenseKey);
    await prisma.instanceLicense.upsert({
      where: { instanceId: LOCAL_INSTANCE_ID },
      update: {
        licenseKey: encrypted,
        lastSeenAt: new Date(),
        isActive: true,
        revokedAt: null,
      },
      create: {
        instanceId: LOCAL_INSTANCE_ID,
        licenseKey: encrypted,
        name: 'Local plugin license',
        plan: 'enterprise',
        maxPlugins: 1000,
        maxVersions: 100,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });
  }
}

export const pluginLicenseService = new PluginLicenseService();
export default pluginLicenseService;
