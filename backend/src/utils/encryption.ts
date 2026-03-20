import crypto from 'crypto';

// Utilidades para cifrado en reposo
export class EncryptionUtils {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32;
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;

  // Generar una clave de cifrado segura
  static generateKey(): string {
    return crypto.randomBytes(this.KEY_LENGTH).toString('hex');
  }

  // Cifrar datos
  static encrypt(data: string, key: string): {
    encrypted: string;
    iv: string;
    tag: string;
  } {
    const keyBuffer = Buffer.from(key, 'hex');
    const iv = crypto.randomBytes(this.IV_LENGTH);
    
    const cipher = crypto.createCipheriv(this.ALGORITHM, keyBuffer, iv);
    cipher.setAAD(Buffer.from('cloud-shakes', 'utf8')); // Autenticación adicional
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  // Descifrar datos
  static decrypt(encryptedData: {
    encrypted: string;
    iv: string;
    tag: string;
  }, key: string): string {
    try {
      const keyBuffer = Buffer.from(key, 'hex');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');
      
      const decipher = crypto.createDecipheriv(this.ALGORITHM, keyBuffer, iv);
      decipher.setAAD(Buffer.from('cloud-shakes', 'utf8'));
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error('Error al descifrar datos: clave inválida o datos corruptos');
    }
  }

  // Cifrar archivo (Buffer)
  static encryptBuffer(buffer: Buffer, key: string): {
    encrypted: Buffer;
    iv: string;
    tag: string;
  } {
    const keyBuffer = Buffer.from(key, 'hex');
    const iv = crypto.randomBytes(this.IV_LENGTH);
    
    const cipher = crypto.createCipheriv(this.ALGORITHM, keyBuffer, iv);
    cipher.setAAD(Buffer.from('cloud-shakes', 'utf8'));
    
    const encrypted = Buffer.concat([
      cipher.update(buffer),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  // Descifrar archivo (Buffer)
  static decryptBuffer(encryptedData: {
    encrypted: Buffer;
    iv: string;
    tag: string;
  }, key: string): Buffer {
    try {
      const keyBuffer = Buffer.from(key, 'hex');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');
      
      const decipher = crypto.createDecipheriv(this.ALGORITHM, keyBuffer, iv);
      decipher.setAAD(Buffer.from('cloud-shakes', 'utf8'));
      decipher.setAuthTag(tag);
      
      return Buffer.concat([
        decipher.update(encryptedData.encrypted),
        decipher.final()
      ]);
    } catch (error) {
      throw new Error('Error al descifrar archivo: clave inválida o datos corruptos');
    }
  }

  // Generar hash para integridad
  static generateHash(data: string | Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // Verificar integridad
  static verifyIntegrity(data: string | Buffer, expectedHash: string): boolean {
    const actualHash = this.generateHash(data);
    return actualHash === expectedHash;
  }
}

// Configuración para cifrado en reposo
export interface EncryptionConfig {
  enabled: boolean;
  key: string;
  algorithm?: string;
}

// Función para obtener configuración de cifrado
export const getEncryptionConfig = (): EncryptionConfig => {
  return {
    enabled: process.env.ENCRYPTION_ENABLED === 'true',
    key: process.env.ENCRYPTION_KEY || EncryptionUtils.generateKey(),
    algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm'
  };
};

// Helper for credentials string formatting
export function encryptCredential(text: string): string {
    if (!text) return text;
    try {
        const key = crypto.scryptSync(process.env.BACKUP_ENCRYPTION_KEY || 'default-secret', 'salt', 32).toString('hex');
        const { encrypted, iv, tag } = EncryptionUtils.encrypt(text, key);
        return `${iv}:${tag}:${encrypted}`;
    } catch(e) {
        console.error('Failed to encrypt credential', e);
        return text;
    }
}

export function decryptCredential(text: string): string {
    if (!text) return text;
    const parts = text.split(':');
    if (parts.length !== 3) return text;
    try {
        const key = crypto.scryptSync(process.env.BACKUP_ENCRYPTION_KEY || 'default-secret', 'salt', 32).toString('hex');
        return EncryptionUtils.decrypt({ iv: parts[0], tag: parts[1], encrypted: parts[2] }, key);
    } catch(e) {
        console.error('Failed to decrypt credential', e);
        return '';
    }
}
