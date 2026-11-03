import { randomBytes } from 'node:crypto';
export const production = process.env.NODE_ENV === 'production';
if (production && (!process.env.MONGODB_URI || !process.env.BETTER_AUTH_SECRET)) throw new Error('Configure MONGODB_URI and BETTER_AUTH_SECRET before production startup.');
export const config = {
  port: Number(process.env.PORT || 4000),
  mongo: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/studiospace',
  database: process.env.MONGODB_DB || 'studiospace',
  origin: process.env.CLIENT_ORIGIN || 'http://127.0.0.1:3000',
  authUrl: process.env.BETTER_AUTH_URL || 'http://127.0.0.1:3000',
  secret: process.env.BETTER_AUTH_SECRET || randomBytes(48).toString('hex'),
};
