import dotenv from 'dotenv';
dotenv.config();
import app from './app.js';
import './db/migrate.js';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured in production.');
const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`ResourceBridge API listening on http://localhost:${port}`));
