import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import dotenv from 'dotenv';

dotenv.config();
const file = process.env.DATABASE_FILE || './data/resourcebridge.db';
if ((process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === 'test') && file !== ':memory:') throw new Error('Tests must use DATABASE_FILE=:memory:; refusing to open a persistent database.');
const resolved = file === ':memory:' ? file : path.resolve(process.cwd(), file);
if (resolved !== ':memory:') fs.mkdirSync(path.dirname(resolved), { recursive: true });
const connection = new DatabaseSync(resolved);
connection.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
export const db = {
  exec: (sql) => connection.exec(sql),
  prepare: (sql) => {
    const statement = connection.prepare(sql);
    return {
      run: (...params) => statement.run(...params),
      get: (...params) => statement.get(...params),
      all: (...params) => statement.all(...params),
    };
  },
  transaction: (fn) => (...args) => {
    connection.exec('BEGIN');
    try { const result = fn(...args); connection.exec('COMMIT'); return result; }
    catch (error) { connection.exec('ROLLBACK'); throw error; }
  },
};
