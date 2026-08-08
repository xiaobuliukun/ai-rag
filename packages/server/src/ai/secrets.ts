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
    const primaryKey = encryptionKeys()[0];
    if (decryptWithKey(plaintext, primaryKey) !== undefined) {
      return plaintext;
    }

    const legacyPlaintext = decryptSecret(plaintext);
    return legacyPlaintext === undefined
      ? plaintext
      : encryptPlaintext(legacyPlaintext, primaryKey);
  }

  return encryptPlaintext(plaintext, encryptionKeys()[0]);
}

function encryptPlaintext(plaintext: string, key: Buffer) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
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

  for (const key of encryptionKeys()) {
    const plaintext = decryptWithKey(value, key);
    if (plaintext !== undefined) {
      return plaintext;
    }
  }

  return undefined;
}

function decryptWithKey(value: string, key: Buffer) {
  try {
    const [ivPart, tagPart, encryptedPart] = value
      .slice(SECRET_PREFIX.length)
      .split('.');
    if (!ivPart || !tagPart || !encryptedPart) {
      return undefined;
    }

    const decipher = createDecipheriv(ALGORITHM, key, fromBase64Url(ivPart));
    decipher.setAuthTag(fromBase64Url(tagPart));

    return Buffer.concat([
      decipher.update(fromBase64Url(encryptedPart)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return undefined;
  }
}

function encryptionKeys() {
  const secrets = Array.from(
    new Set(
      [
        process.env.AI_CONFIG_SECRET,
        process.env.DATABASE_URL,
        'moxu-local-ai-config',
      ].filter((secret): secret is string => secret !== undefined),
    ),
  );

  return secrets.map((secret) => createHash('sha256').update(secret).digest());
}

function toBase64Url(value: Buffer) {
  return value.toString('base64url');
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url');
}
