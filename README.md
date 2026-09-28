# NeuralTerrain

Cinematic portfolio site with a built-in editor. Express + EJS, MongoDB Atlas for
content, Cloudinary for images.

```
npm install
npm start          # http://localhost:3210  ·  editor at /admin
node test.mjs      # auth + save round-trip check (server must be running)
```

## How content works

The whole site is one JSON document: profile, metrics, and an ordered list of
sections, each holding an ordered list of items. The editor loads it, you change
it, it saves the whole thing back. Three endpoints: `GET`/`PUT /api/content` and
`POST /api/upload`.

- `MONGODB_URI` set → reads and writes Atlas, seeding from `content.json` on first run.
- `MONGODB_URI` blank → reads and writes `content.json` on disk (local only).

On Vercel there is no writable disk, so **MongoDB is required** — without it the
editor returns 503 rather than pretending a save worked.

## Section layouts

`cards` · `timeline` · `certs` · `maps` · `gallery` · `text`, set per section in
the editor. Every item uses one shape, all fields optional:

| field | renders as |
|---|---|
| `title`, `subtitle`, `meta` | heading, coloured subhead, small uppercase line |
| `body` | paragraph, line breaks preserved |
| `bullets[]`, `tags[]` | list, pill row |
| `image`, `caption` | figure; opens in a lightbox under `certs` / `maps` |
| `link`, `linkLabel` | trailing link |
| `accent` | `teal` or `amber` edge |
| `level` | 0–100 meter, used by Skills |

## Environment

Copy `.env.example` to `.env` and fill in:

`ADMIN_PASSWORD` · `MONGODB_URI` · `MONGODB_DB` ·
`CLOUDINARY_CLOUD_NAME` · `CLOUDINARY_API_KEY` · `CLOUDINARY_API_SECRET`

## Deploy

Import the repo at vercel.com/new and add the same variables under
Settings → Environment Variables. `vercel.json` routes extensionless paths to
the Express app and keeps `views/` and `content.json` in the bundle.

## Local utilities

- `node connect.mjs "<mongodb+srv://...>"` — verify a connection string, seed it, write it to `.env`
- `node import-certs.mjs [--apply]` — bulk-upload certificate scans from the
  sibling folders to Cloudinary and attach them to matching entries
