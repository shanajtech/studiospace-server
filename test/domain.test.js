import test from 'node:test';
import assert from 'node:assert/strict';
import { overlaps, validateTime, studioSchema } from '../src/domain.js';
test('adjacent reservations do not overlap; nested and crossing reservations do', () => {
  const interval = (start,end) => ({start:`2030-01-01T${start}:00Z`,end:`2030-01-01T${end}:00Z`});
  assert.equal(overlaps(interval('10:00','12:00'), interval('12:00','13:00')),false);
  assert.equal(overlaps(interval('10:00','12:00'), interval('11:00','13:00')),true);
  assert.equal(overlaps(interval('10:00','14:00'), interval('11:00','12:00')),true);
});
test('booking dates reject past, reversed and out-of-range duration', () => {
 const now = new Date('2030-01-01T00:00:00Z');
 assert.equal(validateTime('2030-01-02T10:00:00Z','2030-01-02T11:00:00Z',now),null);
 for(const [s,e] of [['2029-01-01','2029-01-02'],['2030-01-02T12:00:00Z','2030-01-02T11:00:00Z'],['2030-01-02T10:00:00Z','2030-01-02T10:30:00Z'],['2030-01-02','2030-01-04']]) assert.ok(validateTime(s,e,now));
});
test('studio validation rejects owner spoofing and insecure image sources',()=>{
 const valid={title:'Daylight Studio',category:'Photo Studio',hourlyRate:50,deposit:100,capacity:8,location:'Dhaka',images:['https://images.unsplash.com/photo-1497366754035-f200968a6e72'],amenities:['Wi-Fi'],overview:'A bright creative studio with professional lighting and an open floor.'};
 assert.ok(studioSchema.safeParse(valid).success);
 assert.equal(studioSchema.safeParse({...valid,ownerEmail:'attacker@example.com'}).success,false);
 assert.equal(studioSchema.safeParse({...valid,images:['javascript:alert(1)']}).success,false);
 assert.equal(studioSchema.safeParse({...valid,hourlyRate:-1}).success,false);
});
