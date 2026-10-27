import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { MongoClient } from 'mongodb';
import { hashPassword } from '../security.js';

const uri = process.env.MONGODB_URI?.trim();
const dbName = process.env.MONGODB_DB?.trim() || 'harvestlink';
if (!uri) {
  console.error('Set MONGODB_URI in backend/.env first.');
  process.exit(1);
}
const rl = readline.createInterface({ input, output });
async function hidden(prompt) {
  output.write(prompt);
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Run this command directly in an interactive terminal so the password can be hidden.');
  }
  return await new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => { input.setRawMode(false); input.pause(); input.removeListener('data', onData); output.write('\n'); };
    const onData = key => {
      const s = key.toString('utf8');
      if (s === '\u0003') { cleanup(); reject(new Error('Cancelled.')); return; }
      if (s === '\r' || s === '\n') { cleanup(); resolve(value); return; }
      if (s === '\u007f' || s === '\b') { value = value.slice(0, -1); return; }
      if (s >= ' ') value += s;
    };
    input.setRawMode(true); input.resume(); input.on('data', onData);
  });
}
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
try {
  const email = (await rl.question('Admin email: ')).trim().toLowerCase();
  const name = (await rl.question('Admin display name [HarvestLink Admin]: ')).trim() || 'HarvestLink Admin';
  const location = (await rl.question('Admin location [Hyderabad, Telangana]: ')).trim() || 'Hyderabad, Telangana';
  rl.close();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid admin email address.');
  const password = await hidden('Admin password (hidden; minimum 8 characters): ');
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
  await client.connect();
  const users = client.db(dbName).collection('users');
  const old = await users.findOne({ email });
  const uid = old?.uid || randomUUID();
  const timestamp = new Date().toISOString();
  const profile = {
    _id: uid, uid, email, name, location, role: 'admin',
    passwordHash: hashPassword(password),
    createdAt: old?.createdAt || timestamp, updatedAt: timestamp,
  };
  await users.replaceOne({ _id: uid }, profile, { upsert: true });
  console.log(`Admin account provisioned for ${email}. Password was not displayed or stored in plain text.`);
  console.log('This is a one-time terminal-only admin setup. Keep the password private.');
} catch (error) {
  console.error('Admin provisioning failed:', error.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await client.close().catch(() => {});
}
