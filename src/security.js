import { fromNodeHeaders } from 'better-auth/node';
import { SignJWT, jwtVerify } from 'jose';
import { auth } from './auth.js';
import { config, production } from './config.js';
export const cookieName = production ? '__Host-studiospace.jwt' : 'studiospace.jwt';
const key = new TextEncoder().encode(config.secret);
export const cookieOptions = { httpOnly: true, secure: production, sameSite: 'lax', path: '/', maxAge: 15 * 60 * 1000 };
export async function getSession(req) { return auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); }
export async function issueToken(user) { return new SignJWT({ email: user.email }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuer(config.authUrl).setAudience('studiospace-api').setIssuedAt().setExpirationTime('15m').sign(key); }
export async function requireUser(req, res, next) {
  try {
    const token = req.cookies[cookieName];
    if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
    const { payload } = await jwtVerify(token, key, { issuer: config.authUrl, audience: 'studiospace-api', algorithms: ['HS256'] });
    const session = await getSession(req);
    if (!session?.user || session.user.id !== payload.sub) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    req.user = session.user;
    next();
  } catch { res.status(401).json({ error: 'Your session has expired. Please sign in again.' }); }
}
export function originGuard(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (req.headers.origin !== config.origin) return res.status(403).json({ error: 'This request origin is not permitted.' });
  }
  next();
}
