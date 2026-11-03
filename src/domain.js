import { z } from 'zod';
export const categories = ['Photo Studio', 'Film Stage', 'Podcast Lounge', 'Music Suite', 'Workshop'];
const safeImage = z.url().refine(url => url.startsWith('https://'), 'Use an HTTPS image URL');
export const studioSchema = z.object({
  title: z.string().trim().min(4).max(100),
  category: z.enum(categories),
  hourlyRate: z.coerce.number().min(1).max(10000),
  deposit: z.coerce.number().min(0).max(100000),
  capacity: z.coerce.number().int().min(1).max(500),
  location: z.string().trim().min(3).max(180),
  images: z.array(safeImage).min(1).max(6),
  amenities: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
  overview: z.string().trim().min(30).max(6000),
}).strict();
export const reservationSchema = z.object({ studioId: z.string().regex(/^[a-f\d]{24}$/i), start: z.iso.datetime(), end: z.iso.datetime(), guests: z.coerce.number().int().min(1).max(500), note: z.string().max(1000).default('') });
export function overlaps(a, b) { return new Date(a.start) < new Date(b.end) && new Date(a.end) > new Date(b.start); }
export function validateTime(start, end, now = new Date()) {
  const s = new Date(start), e = new Date(end);
  if (!Number.isFinite(+s) || !Number.isFinite(+e) || s <= now || e <= s) return 'Choose a future start and a later end time.';
  const hours = (e - s) / 3600000;
  if (hours < 1 || hours > 24) return 'Reserve between 1 and 24 hours.';
  return null;
}
