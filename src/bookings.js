import { ObjectId } from 'mongodb';
import { client, db } from './db.js';
import { validateTime } from './domain.js';
export class RequestError extends Error { constructor(status, message) { super(message); this.status = status; } }
export async function reserve(user, input) {
  const message = validateTime(input.start, input.end);
  if (message) throw new RequestError(400, message);
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const studio = await db.collection('studios').findOneAndUpdate({ _id: new ObjectId(input.studioId) }, { $inc: { bookingRevision: 1 } }, { session, returnDocument: 'after' });
      if (!studio) throw new RequestError(404, 'This studio is no longer available.');
      if (studio.ownerEmail === user.email) throw new RequestError(400, 'You cannot book your own studio.');
      if (input.guests > studio.capacity) throw new RequestError(400, `This space accommodates up to ${studio.capacity} guests.`);
      const start = new Date(input.start), end = new Date(input.end);
      const collision = await db.collection('bookings').findOne({ studioId: input.studioId, status: 'Confirmed', start: { $lt: end }, end: { $gt: start } }, { session });
      if (collision) throw new RequestError(409, 'This studio is already booked during those hours. Choose another time.');
      const duplicate = await db.collection('bookings').findOne({ userId: user.id, studioId: input.studioId, start, end, status: { $in: ['Pending', 'Confirmed'] } }, { session });
      if (duplicate) throw new RequestError(409, 'You already have a reservation for this time.');
      const hours = (end - start) / 3600000;
      const booking = { studioId: input.studioId, userId: user.id, userEmail: user.email, userName: user.name, hostEmail: studio.ownerEmail, studioTitle: studio.title, image: studio.images[0], location: studio.location, hourlyRate: studio.hourlyRate, deposit: studio.deposit, total: Math.round((hours * studio.hourlyRate + studio.deposit) * 100) / 100, hours, start, end, guests: input.guests, note: input.note, status: 'Pending', createdAt: new Date() };
      const result = await db.collection('bookings').insertOne(booking, { session });
      return { ...booking, _id: result.insertedId };
    });
  } finally { await session.endSession(); }
}
export async function changeBooking(user, id, status) {
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const booking = await db.collection('bookings').findOne({ _id: new ObjectId(id) }, { session });
      if (!booking) throw new RequestError(404, 'Booking not found.');
      const isHost = booking.hostEmail === user.email, isGuest = booking.userId === user.id;
      if (status === 'Cancelled') {
        if (!isGuest || booking.status !== 'Pending') throw new RequestError(403, 'Only your own pending bookings can be cancelled.');
      } else if (!isHost || (status === 'Confirmed' && booking.status !== 'Pending') || (status === 'Completed' && booking.status !== 'Confirmed')) {
        throw new RequestError(403, 'This booking cannot be changed by this account.');
      }
      if (status === 'Completed' && new Date(booking.end) > new Date()) throw new RequestError(400, 'A reservation can be completed after its end time.');
      if (status === 'Confirmed') {
        await db.collection('studios').updateOne({ _id: new ObjectId(booking.studioId) }, { $inc: { bookingRevision: 1 } }, { session });
        const collision = await db.collection('bookings').findOne({ studioId: booking.studioId, status: 'Confirmed', start: { $lt: booking.end }, end: { $gt: booking.start }, _id: { $ne: booking._id } }, { session });
        if (collision) throw new RequestError(409, 'Another confirmed reservation overlaps this time.');
        if (new Date(booking.start) <= new Date()) throw new RequestError(400, 'An expired request cannot be confirmed.');
      }
      await db.collection('bookings').updateOne({ _id: booking._id }, { $set: { status, updatedAt: new Date() } }, { session });
      return { ...booking, status };
    });
  } finally { await session.endSession(); }
}
