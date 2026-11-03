import { auth } from '../src/auth.js';
import { connectDatabase, client } from '../src/db.js';
const email=process.env.EXAMINER_EMAIL;
const password=process.env.EXAMINER_PASSWORD;
if(!email||!password)throw new Error('Set EXAMINER_EMAIL and EXAMINER_PASSWORD privately before creating the demonstration account.');
try{await connectDatabase();await auth.api.signUpEmail({body:{name:'StudioSpace Examiner',email,password}});console.log('Examiner account created. Credentials were not printed.');}finally{await client.close();}
