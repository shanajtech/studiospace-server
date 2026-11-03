import { app } from './app.js';
import { connectDatabase } from './db.js';
import { config } from './config.js';
await connectDatabase();
app.listen(config.port, process.env.HOST || '0.0.0.0', () => console.log(`StudioSpace API ready on port ${config.port}`));
