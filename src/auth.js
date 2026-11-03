import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { jwt } from 'better-auth/plugins';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { db } from './db.js';
import { config, production } from './config.js';
export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const auth = betterAuth({
  appName: 'StudioSpace',
  baseURL: config.authUrl,
  secret: config.secret,
  trustedOrigins: [config.origin],
  database: mongodbAdapter(db),
  emailAndPassword: { enabled: true, minPasswordLength: 6, requireEmailVerification: false, autoSignIn: false },
  socialProviders: googleEnabled ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } } : {},
  advanced: { useSecureCookies: production },
  plugins: [jwt()],
  hooks: { before: createAuthMiddleware(async ctx => {
    if (ctx.path === '/sign-up/email' && !/^(?=.*[a-z])(?=.*[A-Z]).{6,}$/.test(ctx.body?.password || '')) {
      throw new APIError('BAD_REQUEST', { message: 'Use at least 6 characters, including uppercase and lowercase letters.' });
    }
  }) },
});
