import { app } from './app.js';
import { connectDatabase } from './db.js';
import { config } from './config.js';
await connectDatabase();
app.listen(config.port, '127.0.0.1', () => console.log(`StudioSpace API ready at http://127.0.0.1:${config.port}`));
