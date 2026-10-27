import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI?.trim();
const dbName = process.env.MONGODB_DB?.trim() || 'harvestlink';
if (!uri) {
  console.error('MONGODB_URI is missing from backend/.env.');
  process.exit(1);
}
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const result = await client.db(dbName).command({ ping: 1 });
  if (result.ok !== 1) throw new Error('MongoDB ping did not return ok=1.');
  console.log(`Connection successful. MongoDB ping OK; configured database: ${dbName}.`);
} catch (error) {
  console.error('MongoDB connection failed:', error.codeName || error.code || error.message);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
