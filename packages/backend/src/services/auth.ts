import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_EXPIRY = '7d';

export interface JwtPayload {
  login: string;
  iat?: number;
  exp?: number;
}

export async function verifyCredentials(
  login: string,
  password: string,
): Promise<boolean> {
  const expectedLogin = process.env['ADMIN_LOGIN'];
  const expectedHash = process.env['ADMIN_PASSWORD_HASH'];

  if (!expectedLogin || !expectedHash) {
    throw new Error('ADMIN_LOGIN or ADMIN_PASSWORD_HASH env vars not set');
  }

  if (login !== expectedLogin) return false;

  return bcrypt.compare(password, expectedHash);
}

function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET env var not set');
  return secret;
}

export function signToken(payload: Pick<JwtPayload, 'login'>): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
}