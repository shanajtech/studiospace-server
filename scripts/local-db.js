import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mkdir } from 'node:fs/promises';
await mkdir('.local-data/db', { recursive: true });
const repl = await MongoMemoryReplSet.create({ binary: { downloadDir: '.local-data/bin' }, replSet: { count: 1, storageEngine: 'wiredTiger', name: 'studiospace' }, instanceOpts: [{ port: 27017, dbPath: '.local-data/db' }] });
console.log('Local MongoDB replica set ready at mongodb://127.0.0.1:27017/studiospace?replicaSet=studiospace');
async function stop(){await repl.stop();process.exit(0);}process.on('SIGINT',stop);process.on('SIGTERM',stop);
