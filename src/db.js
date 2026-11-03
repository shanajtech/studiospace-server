import { MongoClient } from 'mongodb';
import { config } from './config.js';
export const client = new MongoClient(config.mongo, { serverSelectionTimeoutMS: 8000 });
export const db = client.db(config.database);
export async function connectDatabase() {
  await client.connect();
  await Promise.all([
    db.collection('studios').createIndex({ category: 1, createdAt: -1 }),
    db.collection('studios').createIndex({ ownerEmail: 1 }),
    db.collection('bookings').createIndex({ studioId: 1, status: 1, start: 1, end: 1 }),
    db.collection('bookings').createIndex({ userId: 1, createdAt: -1 }),
    db.collection('wishlist').createIndex({ userId: 1, studioId: 1 }, { unique: true }),
    db.collection('newsletter').createIndex({ email: 1 }, { unique: true }),
  ]);
}
