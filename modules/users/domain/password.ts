import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

const SCRYPT_OPTIONS = { N: 1 << 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }
const derive = (password: string, salt: Buffer, length: number) =>
  new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, length, SCRYPT_OPTIONS, (error, key) =>
      error ? reject(error) : resolve(key),
    )
  })

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const digest = await derive(password, salt, 64)
  return `scrypt-v1$${salt.toString('base64url')}$${digest.toString('base64url')}`
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltText, digestText, extra] = encoded.split('$')
  if (algorithm !== 'scrypt-v1' || !saltText || !digestText || extra) return false
  const salt = Buffer.from(saltText, 'base64url')
  const expected = Buffer.from(digestText, 'base64url')
  if (salt.length !== 16 || expected.length !== 64) return false
  const actual = await derive(password, salt, expected.length)
  return timingSafeEqual(actual, expected)
}
