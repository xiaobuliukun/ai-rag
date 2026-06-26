import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const SECRET_PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export function encryptSecret(value?: string | null) {
  const plaintext = value?.trim();
  if (!plaintext) {
    return null;
  }

  if (plaintext.startsWith(SECRET_PREFIX)) {
    return plaintext;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${SECRET_PREFIX}${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(
    encrypted,
  )}`;
}

export function decryptSecret(value?: string | null) {
  if (!value) {
    return undefined;
  }

  if (!value.startsWith(SECRET_PREFIX)) {
    return value;
  }

  try {
    const [ivPart, tagPart, encryptedPart] = value
      .slice(SECRET_PREFIX.length)
      .split('.');
    if (!ivPart || !tagPart || !encryptedPart) {
      return undefined;
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      fromBase64Url(ivPart),
    );
    decipher.setAuthTag(fromBase64Url(tagPart));

    return Buffer.concat([
      decipher.update(fromBase64Url(encryptedPart)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return undefined;
  }
}

function encryptionKey() {
  const secret =
    process.env.AI_CONFIG_SECRET ??
    process.env.DATABASE_URL ??
    'juejin-flow-local-ai-config';

  return createHash('sha256').update(secret).digest();
}

function toBase64Url(value: Buffer) {
  return value.toString('base64url');
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url');
}
