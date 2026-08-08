import { decryptSecret, encryptSecret } from './secrets';

describe('AI secrets', () => {
  const originalSecret = process.env.AI_CONFIG_SECRET;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.AI_CONFIG_SECRET = 'unit-test-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.AI_CONFIG_SECRET;
    } else {
      process.env.AI_CONFIG_SECRET = originalSecret;
    }
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('encrypts and decrypts API keys', () => {
    const encrypted = encryptSecret('sk-test-key');

    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain('sk-test-key');
    expect(decryptSecret(encrypted)).toBe('sk-test-key');
    expect(encryptSecret(encrypted)).toBe(encrypted);
  });

  it('decrypts and rotates keys created with the legacy database secret', () => {
    delete process.env.AI_CONFIG_SECRET;
    process.env.DATABASE_URL = 'file:/legacy/moxu.db';
    const legacyEncrypted = encryptSecret('sk-legacy-key');

    process.env.AI_CONFIG_SECRET = 'new-desktop-secret';
    const rotated = encryptSecret(legacyEncrypted);

    expect(rotated).toMatch(/^enc:v1:/);
    expect(rotated).not.toBe(legacyEncrypted);
    expect(decryptSecret(rotated)).toBe('sk-legacy-key');
  });

  it('keeps old plaintext keys readable during migration', () => {
    expect(decryptSecret('sk-plain-key')).toBe('sk-plain-key');
    expect(encryptSecret('')).toBeNull();
  });
});
