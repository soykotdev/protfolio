import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { configured as mediaReady, signUpload, deliveryUrl } from './media.js';

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
app.use(express.json({ limit: '2mb' }));
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

// Uploads go browser -> Cloudinary directly (Vercel caps request bodies at
// 4.5 MB). The server only signs the request and later builds the URL.
app.post('/api/upload/sign', auth, (req, res) => {
  if (!mediaReady()) return res.status(503).json({ error: 'Cloudinary is not configured in .env.' });
  res.json(signUpload({ protect: !!req.body?.protect }));
});

app.post('/api/upload/url', auth, (req, res) => {
  const { publicId, format } = req.body || {};
  if (typeof publicId !== 'string' || !/^portfolio(?:\/[\w-]+)+$/.test(publicId)) {
    return res.status(400).json({ error: 'Unknown upload.' });
  }
  if (!mediaReady()) return res.status(503).json({ error: 'Cloudinary is not configured in .env.' });
  // Protection follows where the file was stored, never what the browser claims.
  const protect = publicId.startsWith('portfolio/certificates/');
  res.json({ url: deliveryUrl(publicId, { protect, isPdf: format === 'pdf' }) });
});

if (!SERVERLESS) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`http://localhost:${port}  ·  admin at /admin`));
}

export default app;
