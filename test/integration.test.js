import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
// This suite creates and removes only its own isolated test database.
process.env.MONGODB_DB=`studiospace_test_${randomBytes(6).toString('hex')}`;
process.env.BETTER_AUTH_SECRET=randomBytes(48).toString('hex');
const {app}=await import('../src/app.js');
const {db,client,connectDatabase}=await import('../src/db.js');
const {default:request}=await import('supertest');
const origin='http://localhost:3000';
test('authenticated ownership, booking lifecycle, collisions and logout',async()=>{
 await connectDatabase();
 try {
  const host=request.agent(app), guest=request.agent(app), stranger=request.agent(app);
  async function account(agent,name,email){
   const body={name,email,password:'TestPassword42'};
   await agent.post('/api/auth/sign-up/email').set('Origin',origin).send(body).expect(200);
   await agent.post('/api/auth/sign-in/email').set('Origin',origin).send(body).expect(200);
   const session=await agent.get('/api/session').expect(200);
   assert.equal(session.body.user.email,email);
  }
  await account(host,'Test Host','host@integration.example');
  await account(guest,'Test Guest','guest@integration.example');
  await account(stranger,'Other Guest','other@integration.example');
  const payload={title:'Integration Test Studio',category:'Photo Studio',hourlyRate:60,deposit:100,capacity:5,location:'Dhaka',images:['https://images.unsplash.com/photo-1497366754035-f200968a6e72'],amenities:['Wi-Fi'],overview:'A bright and flexible creative studio for product photography and portraits.'};
  await request(app).post('/api/studios').set('Origin',origin).send(payload).expect(401);
  await host.post('/api/studios').set('Origin','https://untrusted.example').send(payload).expect(403);
  const created=await host.post('/api/studios').set('Origin',origin).send(payload).expect(201);
  const id=created.body._id;
  await request(app).get('/api/me/wishlist').expect(401);
  await request(app).put(`/api/me/wishlist/${id}`).set('Origin',origin).expect(401);
  await guest.put(`/api/me/wishlist/${id}`).set('Origin',origin).expect(200);
  await guest.put(`/api/me/wishlist/${id}`).set('Origin',origin).expect(200);
  const saved=await guest.get('/api/me/wishlist').expect(200);
  assert.equal(saved.body.length,1);assert.equal(saved.body[0]._id,id);
  assert.equal((await stranger.get('/api/me/wishlist').expect(200)).body.length,0);
  await stranger.delete(`/api/me/wishlist/${id}`).set('Origin',origin).expect(200);
  assert.equal((await guest.get('/api/me/wishlist').expect(200)).body.length,1);
  await guest.put('/api/me/wishlist/000000000000000000000000').set('Origin',origin).expect(404);
  await guest.put('/api/me/wishlist/not-an-id').set('Origin',origin).expect(400);
  await guest.patch(`/api/studios/${id}`).set('Origin',origin).send({...payload,title:'Stolen studio'}).expect(404);
  const start=new Date(Date.now()+86400000).toISOString(),end=new Date(Date.now()+93600000).toISOString();
  const input={studioId:id,start,end,guests:2,note:'Test only'};
  await host.post('/api/bookings').set('Origin',origin).send(input).expect(400);
  const pending=await guest.post('/api/bookings').set('Origin',origin).send(input).expect(201);
  assert.equal(pending.body.status,'Pending');assert.equal(pending.body.total,220);
  await request(app).get(`/api/bookings/${pending.body._id}/invoice`).expect(401);
  await guest.get(`/api/bookings/${pending.body._id}/invoice`).expect(409);
  await stranger.patch(`/api/bookings/${pending.body._id}`).set('Origin',origin).send({status:'Cancelled'}).expect(403);
  const second=await stranger.post('/api/bookings').set('Origin',origin).send(input).expect(201);
  await host.patch(`/api/bookings/${pending.body._id}`).set('Origin',origin).send({status:'Confirmed'}).expect(200);
  await stranger.get(`/api/bookings/${pending.body._id}/invoice`).expect(403);
  const invoice=await guest.get(`/api/bookings/${pending.body._id}/invoice`).buffer(true).parse((res,done)=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>done(null,Buffer.concat(chunks)));}).expect(200);
  assert.match(invoice.headers['content-type'],/application\/pdf/);assert.match(invoice.headers['content-disposition'],/attachment/);assert.equal(invoice.body.subarray(0,5).toString(),'%PDF-');
  const {PDFParse}=await import('pdf-parse');const parsed=new PDFParse({data:invoice.body});const pdfText=await parsed.getText();await parsed.destroy();
  assert.match(pdfText.text,/Integration Test Studio/);assert.match(pdfText.text,/220\.00/);assert.match(pdfText.text,/PAYMENT NOT COLLECTED/);assert.equal(pdfText.total,1);
  await host.get(`/api/bookings/${pending.body._id}/invoice`).expect(200);
  await host.patch(`/api/bookings/${second.body._id}`).set('Origin',origin).send({status:'Confirmed'}).expect(409);
  await guest.post('/api/bookings').set('Origin',origin).send(input).expect(409);
  await guest.patch(`/api/bookings/${pending.body._id}`).set('Origin',origin).send({status:'Cancelled'}).expect(403);
  await stranger.patch(`/api/bookings/${second.body._id}`).set('Origin',origin).send({status:'Cancelled'}).expect(200);
  await stranger.get(`/api/bookings/${second.body._id}/invoice`).expect(409);
  await guest.delete(`/api/me/wishlist/${id}`).set('Origin',origin).expect(200);
  assert.equal((await guest.get('/api/me/wishlist').expect(200)).body.length,0);
  await host.delete(`/api/studios/${id}`).set('Origin',origin).expect(409);
  await guest.post('/api/auth/sign-out').set('Origin',origin).send({}).expect(200);
  await guest.get('/api/me/bookings').expect(401);
 }finally{await db.dropDatabase();await client.close();}
});

