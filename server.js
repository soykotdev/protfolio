import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { v2 as cloudinary } from 'cloudinary';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(DIR, 'content.json');
const ID = 'content';

// ponytail: whole site is one document. Section/item CRUD would be 20 endpoints
// for a single-author portfolio; split it out only if two people ever edit at once.
let col = null;
if (process.env.MONGODB_URI) {
  try {
    const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    col = client.db(process.env.MONGODB_DB || 'portfolio').collection('site');
    if (!(await col.findOne({ _id: ID }))) {
      await col.insertOne({ _id: ID, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) });
      console.log('seeded MongoDB from content.json');
    }
    console.log('storage: MongoDB');
  } catch (e) {
    col = null;
    console.error('\nMongoDB connection failed: ' + e.message);
    console.error('Check MONGODB_URI in .env, and that your IP is on the Atlas access list.');
    console.error('Falling back to content.json — the site still works.\n');
  }
} else {
  console.log('storage: content.json (set MONGODB_URI to use MongoDB)');
}

const read = async () => {
  if (!col) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const doc = await col.findOne({ _id: ID });
  return doc || JSON.parse(fs.readFileSync(FILE, 'utf8'));
};

const SERVERLESS = !!process.env.VERCEL;
const write = async (doc) => {
  delete doc._id;
  if (col) return col.replaceOne({ _id: ID }, { _id: ID, ...doc }, { upsert: true });
  if (SERVERLESS) throw new Error('MongoDB is not connected, and this host has no writable disk. Set MONGODB_URI.');
  fs.writeFileSync(FILE, JSON.stringify(doc, null, 2));
};

if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const PASS = process.env.ADMIN_PASSWORD || '';
function auth(req, res, next) {
  const a = Buffer.from(req.get('x-admin-key') || '');
  const b = Buffer.from(PASS);
  if (!PASS || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Wrong password.' });
  }
  next();
}

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(DIR, 'views'));
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(DIR, 'public')));

app.get('/', async (_req, res) => res.render('index', { c: await read() }));
app.get('/admin', (_req, res) => res.render('admin'));

app.get('/api/content', async (_req, res) => res.json(await read()));
app.post('/api/auth', auth, (_req, res) => res.json({ ok: true }));

app.put('/api/content', auth, async (req, res) => {
  if (!req.body?.profile || !Array.isArray(req.body.sections)) {
    return res.status(400).json({ error: 'Content needs a profile and a sections array.' });
  }
  try {
    await write(req.body);
  } catch (e) {
    return res.status(503).json({ error: e.message });
  }
  res.json({ ok: true });
});

app.post('/api/upload', auth, async (req, res) => {
  const data = req.body?.data;
  if (typeof data !== 'string' || !data.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Send an image as a data URL.' });
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return res.status(503).json({ error: 'Cloudinary is not configured in .env.' });
  }
  try {
    const r = await cloudinary.uploader.upload(data, {
      folder: 'portfolio',
      transformation: [{ width: 1800, height: 1800, crop: 'limit', quality: 'auto:good' }],
    });
    res.json({ url: r.secure_url });
  } catch (e) {
    res.status(502).json({ error: 'Upload failed: ' + e.message });
  }
});

if (!SERVERLESS) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`http://localhost:${port}  ·  admin at /admin`));
}

export default app;
