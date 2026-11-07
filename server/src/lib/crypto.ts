import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url')}`;
export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length, {
    ...SCRYPT,
    N: Number(n),
  });
  return timingSafeEqual(actual, expected);
}

// Compared against when the email is unknown, so login timing doesn't reveal
// which addresses have accounts.
export const DUMMY_PASSWORD_HASH = hashPassword(randomBytes(16).toString('hex'));
