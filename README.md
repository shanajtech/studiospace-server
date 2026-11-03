# StudioSpace API

Express and MongoDB backend for the StudioSpace creative workspace marketplace.

**Live API:** https://studiospace-server-rcp1.onrender.com/api/health

**Live website:** https://studiospace-client-dusky.vercel.app

**Client source:** https://github.com/shanajtech/studiospace-client

**Server source:** https://github.com/shanajtech/studiospace-server

## Features
- Better Auth email/password and Google OAuth with MongoDB storage.
- HTTP-only signed JWT cookie and live session checks on private API routes.
- Owner-only studio creation, editing and deletion.
- Transactional booking requests and host confirmation with overlap protection.
- Pending booking cancellation, host reservation management and completion.
- Studio image URLs stored in MongoDB, search, categories, pricing and pagination. The frontend integrates the official PostImage upload window with automatic photo insertion.

## Run locally
Use Node 22 or newer. Run `npm ci`, copy `.env.example` to `.env`, and configure your database and secret. `npm run local-db` can run a separate local MongoDB replica set for development. Keep that terminal running, then run `npm run seed` and `npm run dev` in separate terminals. The frontend runs at `http://localhost:3000`; the API runs on port 4000.

`npm test` uses its own randomly named database on the configured MongoDB server, then drops only that database. It verifies real authentication, ownership, origin rejection, booking prices, host approval, overlapping reservations, cancellation, and session revocation. A running replica set is required.

## Deployment
Deploy as a Node web service using `npm ci` as build command and `npm start` as start command. Set `NODE_ENV=production`, `MONGODB_URI`, `MONGODB_DB`, `BETTER_AUTH_SECRET`, `CLIENT_ORIGIN`, and `BETTER_AUTH_URL`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google login. PostImage uploads in the frontend do not need a server key. `IMGBB_API_KEY` enables a separate optional upload endpoint, but the deployed UI uses PostImage because ImgBB rejected uploads from the service. Use a MongoDB replica set (Atlas provides one) because booking conflict protection uses transactions. The service binds to the provider's `PORT` on all interfaces.

Set `BETTER_AUTH_URL` and `CLIENT_ORIGIN` to the public frontend origin, without a trailing slash. Google's authorized redirect URI is `https://YOUR-FRONTEND/api/auth/callback/google`. The frontend proxies `/api` to this service so authentication cookies remain on the frontend domain.

## Demonstration data
`npm run seed` adds six clearly identified demonstration studios and preserves existing data. Set `SEED_HOST_EMAIL` to the actual demo host email before seeding. To create an examiner login, privately set `EXAMINER_EMAIL` and `EXAMINER_PASSWORD` and run `node --env-file-if-exists=.env scripts/examiner.js`. Never commit database credentials, OAuth secrets, or `.env` files.

## Main routes
Public: `GET /api/health`, `/api/config`, `/api/studios`, `/api/studios/:id`.
Authentication: `/api/auth/*`, `GET /api/session`, `POST /api/session/logout`.
Private: studio mutations, `/api/me/listings`, `/api/me/bookings`, `/api/me/reservations`, booking mutations and image uploads. Authenticated user identity always comes from the session rather than client input.

Payments, password recovery and email verification are intentionally outside the assignment scope. Booking amounts are estimates; no money is collected.

