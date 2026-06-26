import { decryptSecret, encryptSecret } from './secrets';

describe('AI secrets', () => {
  const originalSecret = process.env.AI_CONFIG_SECRET;

  beforeEach(() => {
    process.env.AI_CONFIG_SECRET = 'unit-test-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.AI_CONFIG_SECRET;
    } else {
      process.env.AI_CONFIG_SECRET = originalSecret;
    }
  });

  it('encrypts and decrypts API keys', () => {
    const encrypted = encryptSecret('sk-test-key');

    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain('sk-test-key');
    expect(decryptSecret(encrypted)).toBe('sk-test-key');
  });

  it('keeps old plaintext keys readable during migration', () => {
    expect(decryptSecret('sk-plain-key')).toBe('sk-plain-key');
    expect(encryptSecret('')).toBeNull();
  });
});
