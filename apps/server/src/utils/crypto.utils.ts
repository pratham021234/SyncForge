import crypto from 'crypto';

/**
 * Hashes a plaintext password using OWASP-compliant scrypt with a unique 16-byte random salt.
 * Returns format: "salt:derivedKeyHex"
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  });
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Constant-time password verification against stored scrypt hash.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const [salt, expectedKeyHex] = parts;
    if (!salt || !expectedKeyHex) return false;

    const derivedKey = crypto.scryptSync(password, salt, 64, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 32 * 1024 * 1024,
    });

    const expectedBuffer = Buffer.from(expectedKeyHex, 'hex');
    if (derivedKey.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(derivedKey, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Generates an unguessable cryptographically secure random token (hex string).
 */
export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

/**
 * Hashes a raw token with SHA-256 for secure storage.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Generates a project API key with standard prefix:
 * `sf_live_sec_...` or `sf_test_sec_...`
 */
export function generateApiKey(environment: 'development' | 'production'): {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
} {
  const envPrefix = environment === 'production' ? 'sf_live_sec' : 'sf_test_sec';
  const randomEntropy = crypto.randomBytes(24).toString('hex');
  const rawKey = `${envPrefix}_${randomEntropy}`;
  const keyPrefix = `${envPrefix}_${randomEntropy.slice(0, 8)}...`;
  const keyHash = hashToken(rawKey);

  return {
    rawKey,
    keyPrefix,
    keyHash,
  };
}

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Signs a standard JWT with HMAC-SHA256 (RFC 7519)
 */
export function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds = 86400, // 24 hours
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(claims));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.createHmac('sha256', secret).update(dataToSign).digest();
  const encodedSignature = base64UrlEncode(signature);

  return `${dataToSign}.${encodedSignature}`;
}

/**
 * Verifies and decodes an HMAC-SHA256 JWT in constant time.
 */
export function verifyJwt<T = Record<string, unknown>>(token: string, secret: string): T {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT structure');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error('Malformed JWT components');
  }

  const dataToVerify = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(dataToVerify).digest();
  const expectedSigEncoded = base64UrlEncode(expectedSig);

  // Constant-time signature comparison
  const sigBuffer = Buffer.from(encodedSignature);
  const expectedBuffer = Buffer.from(expectedSigEncoded);
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid JWT signature');
  }

  const payloadJson = base64UrlDecode(encodedPayload);
  const payload = JSON.parse(payloadJson) as T & { exp?: number };

  if (typeof payload.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (now > payload.exp) {
      throw new Error('JWT token has expired');
    }
  }

  return payload;
}
