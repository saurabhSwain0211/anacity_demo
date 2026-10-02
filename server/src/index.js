import dotenv from 'dotenv';
dotenv.config();
import app from './app.js';
import { pool } from './db.js';
const port=process.env.PORT||4000;
const server=app.listen(port,()=>console.log(`API listening on ${port}`));
const shutdown=async()=>{server.close(async()=>{await pool.end();process.exit(0);});};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
