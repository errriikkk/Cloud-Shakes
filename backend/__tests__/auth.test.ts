import { describe, it, expect, beforeEach } from 'vitest';
import { hashPassword, verifyPassword, generateAccessToken, verifyToken } from '../src/utils/auth';

describe('Auth Utils', () => {
  describe('hashPassword & verifyPassword', () => {
    it('should hash and verify password correctly', async () => {
      const password = 'testPassword123';
      const hashed = await hashPassword(password);
      
      expect(hashed).not.toBe(password);
      expect(await verifyPassword(hashed, password)).toBe(true);
      expect(await verifyPassword(hashed, 'wrongPassword')).toBe(false);
    });
  });

  describe('generateAccessToken & verifyToken', () => {
    it('should generate and verify access token', () => {
      const payload = { id: 'user-123' };
      const token = generateAccessToken(payload);
      
      expect(token).toBeDefined();
      
      const decoded = verifyToken(token);
      expect(decoded).toBeDefined();
      expect(decoded?.id).toBe('user-123');
      expect(decoded?.type).toBe('access');
    });

    it('should return null for invalid token', () => {
      const decoded = verifyToken('invalid-token');
      expect(decoded).toBeNull();
    });
  });
});
