import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { ObjectId } from 'mongodb';
import { toNodeHandler } from 'better-auth/node';
import { auth, googleEnabled } from './auth.js';
import { db, client } from './db.js';
import { config } from './config.js';
import { categories, studioSchema, reservationSchema } from './domain.js';
import { requireUser, originGuard, getSession, issueToken, cookieName, cookieOptions } from './security.js';
import { reserve, changeBooking, RequestError } from './bookings.js';
import { bookingInvoice } from './invoice.js';
export const app = express();
app.disable('x-powered-by');
// Render terminates HTTPS at its trusted proxy before forwarding to Node.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.origin, credentials: true }));
app.use(rateLimit({ windowMs: 60000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/auth', rateLimit({ windowMs: 60000, limit: 40 }));
app.all('/api/auth/{*splat}', toNodeHandler(auth));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(originGuard);
const studios = db.collection('studios');
function objectId(value) { if (!/^[a-f\d]{24}$/i.test(value || '')) throw new RequestError(400, 'Invalid record identifier.'); return new ObjectId(value); }
app.get('/api/health', async (req, res) => { await db.command({ ping: 1 });res.json({ status: 'ok' }); });
app.get('/api/config', (req, res) => res.json({ googleEnabled, uploadEnabled: Boolean(process.env.IMGBB_API_KEY), categories }));
app.get('/api/session', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const session = await getSession(req);
  if (!session?.user) { res.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined });return res.json({ user: null }); }
  res.cookie(cookieName, await issueToken(session.user), cookieOptions);
  res.json({ user: { id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image } });
});
app.post('/api/session/logout', (req, res) => {res.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined });res.json({ success: true });});
app.get('/api/studios', async (req, res) => {
  const filter = {};
  if (req.query.category && categories.includes(req.query.category)) filter.category = req.query.category;
  if (req.query.q) { const escaped = String(req.query.q).slice(0,100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');filter.$or = [{ title: { $regex: escaped, $options: 'i' } }, { location: { $regex: escaped, $options: 'i' } }]; }
  if (req.query.maxRate && Number.isFinite(Number(req.query.maxRate))) filter.hourlyRate = { $lte: Number(req.query.maxRate) };
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page) || 1));
  const featured = req.query.featured === 'true';
  const limit = featured ? 6 : 12;
  const sort = req.query.sort === 'price-low' ? { hourlyRate: 1, _id: 1 } : req.query.sort === 'price-high' ? { hourlyRate: -1, _id: 1 } : featured || req.query.sort === 'rating' ? { rating: -1, createdAt: -1 } : { createdAt: -1, _id: 1 };
  const [items, total] = await Promise.all([studios.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).toArray(), studios.countDocuments(filter)]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});
app.get('/api/studios/:id', async (req, res) => {
  const studio = await studios.findOne({ _id: objectId(req.params.id) });
  if (!studio) throw new RequestError(404, 'Studio not found.');
  const availability = await db.collection('bookings').find({ studioId: req.params.id, status: 'Confirmed', end: { $gt: new Date() } }, { projection: { start: 1, end: 1, _id: 0 } }).sort({ start: 1 }).limit(200).toArray();
  res.json({ ...studio, availability });
});
app.get('/api/me/listings', requireUser, async (req, res) => res.json(await studios.find({ ownerEmail: req.user.email }).sort({ createdAt: -1 }).toArray()));
app.post('/api/studios', requireUser, async (req, res) => {
  const value = studioSchema.parse(req.body);
  const studio = { ...value, ownerId: req.user.id, ownerEmail: req.user.email, ownerName: req.user.name, ownerImage: req.user.image || null, rating: 0, reviews: [], bookingRevision: 0, createdAt: new Date() };
  const result = await studios.insertOne(studio);res.status(201).json({ ...studio, _id: result.insertedId });
});
app.patch('/api/studios/:id', requireUser, async (req, res) => {
  const value = studioSchema.parse(req.body);
  const result = await studios.findOneAndUpdate({ _id: objectId(req.params.id), ownerEmail: req.user.email }, { $set: { ...value, updatedAt: new Date() } }, { returnDocument: 'after' });
  if (!result) throw new RequestError(404, 'Studio not found or not owned by you.');res.json(result);
});
app.delete('/api/studios/:id', requireUser, async (req, res) => {
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const id = objectId(req.params.id);
      const owned = await studios.findOneAndUpdate({ _id: id, ownerEmail: req.user.email }, { $inc: { bookingRevision: 1 } }, { session });
      if (!owned) throw new RequestError(404, 'Studio not found or not owned by you.');
      const active = await db.collection('bookings').findOne({ studioId: req.params.id, status: { $in: ['Pending','Confirmed'] }, end: { $gt: new Date() } }, { session });
      if (active) throw new RequestError(409, 'This space has upcoming reservations. Resolve them before deleting it.');
      await studios.deleteOne({ _id: id }, { session });
    });
    res.json({ success: true });
  } finally {await session.endSession();}
});
app.get('/api/me/bookings', requireUser, async (req, res) => res.json(await db.collection('bookings').find({ userId: req.user.id }).sort({ createdAt: -1 }).toArray()));
app.get('/api/me/reservations', requireUser, async (req, res) => res.json(await db.collection('bookings').find({ hostEmail: req.user.email }).sort({ createdAt: -1 }).toArray()));
app.get('/api/me/wishlist',requireUser,async(req,res)=>{
  const items=await db.collection('wishlist').aggregate([
    {$match:{userId:req.user.id}},{$sort:{createdAt:-1}},
    {$lookup:{from:'studios',let:{studioId:'$studioId'},pipeline:[{$match:{$expr:{$eq:[{$toString:'$_id'},'$$studioId']}}}],as:'studio'}},
    {$unwind:'$studio'},{$replaceRoot:{newRoot:'$studio'}}
  ]).toArray();res.set('Cache-Control','no-store').json(items);
});
app.put('/api/me/wishlist/:id',requireUser,async(req,res)=>{
  const id=objectId(req.params.id);
  if(!await studios.findOne({_id:id},{projection:{_id:1}}))throw new RequestError(404,'This studio is no longer available.');
  await db.collection('wishlist').updateOne({userId:req.user.id,studioId:req.params.id},{$setOnInsert:{userId:req.user.id,studioId:req.params.id,createdAt:new Date()}},{upsert:true});
  res.json({saved:true});
});
app.delete('/api/me/wishlist/:id',requireUser,async(req,res)=>{
  objectId(req.params.id);await db.collection('wishlist').deleteOne({userId:req.user.id,studioId:req.params.id});res.json({saved:false});
});
app.get('/api/bookings/:id/invoice',requireUser,async(req,res)=>{
  const booking=await db.collection('bookings').findOne({_id:objectId(req.params.id)});
  if(!booking)throw new RequestError(404,'Booking not found.');
  if(booking.userId!==req.user.id&&booking.hostEmail!==req.user.email)throw new RequestError(403,'This invoice belongs to another booking account.');
  if(!['Confirmed','Completed'].includes(booking.status))throw new RequestError(409,'An invoice is available after the host confirms this reservation.');
  const pdf=await bookingInvoice(booking);
  res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="StudioSpace-invoice-${booking._id}.pdf"`,'Cache-Control':'private, no-store'}).send(pdf);
});
app.post('/api/bookings', requireUser, async (req, res) => res.status(201).json(await reserve(req.user, reservationSchema.parse(req.body))));
app.patch('/api/bookings/:id', requireUser, async (req, res) => {
  objectId(req.params.id);
  if (!['Cancelled','Confirmed','Completed'].includes(req.body.status)) throw new RequestError(400, 'Invalid reservation status.');
  res.json(await changeBooking(req.user, req.params.id, req.body.status));
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => cb(null, ['image/jpeg','image/png','image/webp'].includes(file.mimetype)) });
app.post('/api/uploads', requireUser, upload.single('image'), async (req, res) => {
  if (!process.env.IMGBB_API_KEY) throw new RequestError(503, 'Image upload is not configured yet. You can use an HTTPS image URL.');
  if (!req.file) throw new RequestError(400, 'Choose a JPEG, PNG, or WebP image under 5MB.');
  const bytes = req.file.buffer;
  const valid = (bytes[0] === 0xff && bytes[1] === 0xd8) || bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || (bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP');
  if (!valid) throw new RequestError(400, 'The file contents are not a supported image.');
  const form = new FormData();form.append('image', bytes.toString('base64'));
  const endpoint = new URL('https://api.imgbb.com/1/upload');
  endpoint.searchParams.set('key', process.env.IMGBB_API_KEY.trim());
  const response = await fetch(endpoint, { method: 'POST', headers: { 'User-Agent': 'StudioSpace/1.0 (+https://studiospace-client-dusky.vercel.app)', Accept: 'application/json' }, body: form, signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok || !data.success) {
    const reason = String(data.error?.message || '').replace(/[A-Za-z0-9_-]{20,}/g, '[redacted]').slice(0,160);
    console.error('Image host rejected upload:', response.status, Number(data.error?.code) || 'unknown', reason);
    throw new RequestError(502, 'Image service could not upload this image. Please try again.');
  }
  res.status(201).json({ url: data.data.url });
});
app.post('/api/newsletter', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new RequestError(400, 'Enter a valid email address.');
  await db.collection('newsletter').updateOne({ email }, { $setOnInsert: { email, createdAt: new Date() } }, { upsert: true });res.json({ success: true });
});
app.use((req,res)=>res.status(404).json({error:'This API endpoint does not exist.'}));
app.use((error,req,res,next)=>{
  if (error.name === 'ZodError') return res.status(400).json({ error: error.issues[0]?.message || 'Check the form fields.' });
  if (error instanceof RequestError) return res.status(error.status).json({ error: error.message });
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Choose an image smaller than 5MB.' });
  console.error('Request failed:', error.name);
  res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
});

