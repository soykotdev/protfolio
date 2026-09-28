// Point the site at MongoDB Atlas:
//   node connect.mjs "mongodb+srv://Hossain:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"
// Verifies the connection, seeds content.json into it, then writes MONGODB_URI to .env.
import fs from 'node:fs';
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.argv[2];
if (!uri?.startsWith('mongodb')) {
  console.error('Usage: node connect.mjs "mongodb+srv://user:pass@host/..."');
  console.error('Get it from Atlas -> Clusters -> Connect -> Drivers.');
  process.exit(1);
}

const db = process.env.MONGODB_DB || 'portfolio';
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

try {
  await client.connect();
  await client.db(db).command({ ping: 1 });
  console.log('connected to', db);

  const col = client.db(db).collection('site');
  const existing = await col.findOne({ _id: 'content' });
  if (existing) {
    console.log('content document already there — left alone');
  } else {
    await col.insertOne({ _id: 'content', ...JSON.parse(fs.readFileSync('./content.json', 'utf8')) });
    console.log('seeded content.json into MongoDB');
  }

  const env = fs.readFileSync('./.env', 'utf8');
  fs.writeFileSync('./.env', env.replace(/^MONGODB_URI=.*$/m, 'MONGODB_URI=' + uri));
  console.log('wrote MONGODB_URI to .env — restart the server');
} catch (e) {
  console.error('\nfailed:', e.message);
  if (/auth/i.test(e.message)) console.error('-> wrong username or password, or the user has no role on this database.');
  if (/ENOTFOUND|querySrv/i.test(e.message)) console.error('-> the cluster hostname is wrong. Copy it from Atlas -> Connect -> Drivers.');
  if (/timed out|ETIMEDOUT/i.test(e.message)) console.error('-> your IP is not on the Atlas access list. Add it under Network Access.');
  process.exitCode = 1;
} finally {
  await client.close();
}
