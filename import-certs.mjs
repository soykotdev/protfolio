// Bulk-upload the certificate folders to Cloudinary and attach each scan to the
// matching item in the certifications / credentials sections.
//
//   node import-certs.mjs           # dry run: show what matches what
//   node import-certs.mjs --apply   # upload and save
//
// The server must be running. Originals are stored private and served only
// as watermarked, signed URLs (see media.js). PDFs render as page 1.
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { configured, uploadFile, MAX_BYTES } from './media.js';

const APPLY = process.argv.includes('--apply');
const BASE = `http://127.0.0.1:${process.env.PORT || 3000}`;
const KEY = process.env.ADMIN_PASSWORD;
const ROOT = path.resolve('..');
const FOLDERS = ['1.Educational_certificates', '4. Job Certificates', '5.All_Training_certificates', '8. Extra Curriculum', '11. Schoolarship'];
const OK = /\.(pdf|jpe?g|png)$/i;


const words = (s) => (s || '').toLowerCase().match(/[a-z]{3,}/g) || [];
const STOP = new Set(['certificate', 'certificateofcompletion', 'the', 'and', 'with', 'for', 'certificates', 'main', 'file', 'page']);

// score a filename against an item by shared distinctive words
const score = (file, item) => {
  const f = new Set(words(path.basename(file).replace(/[_-]/g, ' ')).filter((w) => !STOP.has(w)));
  const i = new Set(words(`${item.title} ${item.subtitle || ''}`).filter((w) => !STOP.has(w)));
  let n = 0;
  for (const w of f) if (i.has(w)) n++;
  return n;
};

const files = FOLDERS.flatMap((d) => {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => OK.test(f)).map((f) => path.join(dir, f));
});
console.log(`found ${files.length} certificate files\n`);

const content = await (await fetch(`${BASE}/api/content`)).json();
const targets = content.sections.filter((s) => s.layout === 'certs');
if (!targets.length) { console.error('no sections use the "certs" layout'); process.exit(1); }
const items = targets.flatMap((s) => s.items);

// Token overlap can't see through abbreviations (HSC, SSC, BURP, CEGIS), so
// pin those explicitly: [filename pattern, substring of the item's title/subtitle].
const HINTS = [
  [/hsc/i,                 'Higher Secondary'],
  [/ssc/i,                 'Secondary School'],
  [/burp/i,                'Bachelor of Urban'],
  [/cegis/i,               'No-Objection'],
  [/intern/i,              'Internship Certificate'],
  [/smec|ACE/i,            'ACE Consultants'],
  [/hiyatpur/i,            'Hiyatpur'],
  [/usb_pust/i,            'Certificate of Appreciation'],
  [/sports/i,              'Sports Secretary'],
  [/gis[ _]?(training|certificate)/i, 'Advanced Application of GIS'],
  [/python[ _]certificate/i,          'Introduction to Python'],
  [/supermap[_ ]?data/i,   'Visualizing Building Information'],
  [/supermap[_ ]?webinar/i, 'SuperMap Webinar Philippines'],
];

const claimed = new Set();
const find = (needle) => items.find((it) => !claimed.has(it) && !it.image &&
  `${it.title} ${it.subtitle || ''}`.toLowerCase().includes(needle.toLowerCase()));

const plan = [];
for (const f of files) {
  const name = path.basename(f);
  let item = null, how = '';

  for (const [re, needle] of HINTS) {
    if (re.test(name)) { const hit = find(needle); if (hit) { item = hit; how = 'hint'; break; } }
  }
  if (!item) {
    let best = null, bestScore = 0;
    for (const it of items) {
      if (claimed.has(it) || it.image) continue;
      const sc = score(f, it);
      if (sc > bestScore) { bestScore = sc; best = it; }
    }
    if (bestScore >= 2) { item = best; how = `score ${bestScore}`; }
  }
  if (item) claimed.add(item);   // one file per item, no silent overwrite
  plan.push({ file: f, item, how });
}

for (const p of plan) {
  const name = path.basename(p.file);
  console.log(p.item ? `  ${name}
    -> ${p.item.title} [${p.item.subtitle || ''}]  (${p.how})`
                     : `  ${name}
    -> no match, attach it in /admin`);
}

if (!APPLY) { console.log('\ndry run. re-run with --apply to upload.'); process.exit(0); }
if (!configured()) { console.error('\nCloudinary is not configured in .env'); process.exit(1); }

let done = 0;
for (const p of plan) {
  if (!p.item) continue;
  const size = fs.statSync(p.file).size;
  if (size > MAX_BYTES) {
    console.error(`skipped ${path.basename(p.file)}: ${(size / 1048576).toFixed(1)} MB is over Cloudinary's 10 MB cap`);
    continue;
  }
  try {
    // every certificate: private original, watermarked signed delivery URL
    p.item.image = await uploadFile(p.file, { protect: true });
    done++;
    console.log(`uploaded ${path.basename(p.file)}`);
  } catch (e) {
    console.error(`failed ${path.basename(p.file)}: ${e.message}`);
  }
}

if (done) {
  const res = await fetch(`${BASE}/api/content`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-admin-key': KEY },
    body: JSON.stringify(content),
  });
  console.log(res.ok ? `\nsaved ${done} certificate images` : `\nsave failed: ${res.status}`);
} else {
  console.log('\nnothing uploaded');
}
