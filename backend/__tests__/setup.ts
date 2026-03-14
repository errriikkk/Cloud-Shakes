import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = 'test-secret-key';
  process.env.MINIO_ROOT_PASSWORD = 'testminio';
  process.env.ADMIN_PASSWORD = 'testadmin';
});

afterAll(() => {
  delete process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  delete process.env.JWT_SECRET;
});
