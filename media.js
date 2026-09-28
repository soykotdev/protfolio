// Cloudinary rules shared by server.js and import-certs.mjs.
//
// Protected uploads (certificates) are stored as type "authenticated": the
// original is not publicly reachable. They are only ever served through a
// signed URL whose signature covers the watermark transformation, so editing
// the URL to strip the watermark invalidates it and Cloudinary returns 401.
import { v2 as cloudinary } from 'cloudinary';

export const WATERMARK = 'SOYKOT HOSSAIN SARKER  ·  PORTFOLIO COPY  ·  NOT VALID FOR VERIFICATION';
export const MAX_BYTES = 10 * 1024 * 1024; // Cloudinary free-plan cap per file

let ready = false;
export function configured() {
  if (!process.env.CLOUDINARY_CLOUD_NAME) return false;
  if (!ready) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    ready = true;
  }
  return true;
}

const folderFor = (protect) => (protect ? 'portfolio/certificates' : 'portfolio');
const typeFor = (protect) => (protect ? 'authenticated' : 'upload');

// Parameters a browser needs to upload straight to Cloudinary. Everything
// except the file itself is covered by the signature, so the browser cannot
// switch a certificate to a public type.
export function signUpload({ protect }) {
  const params = {
    timestamp: Math.round(Date.now() / 1000),
    folder: folderFor(protect),
    type: typeFor(protect),
  };
  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
  return {
    ...params,
    signature,
    api_key: process.env.CLOUDINARY_API_KEY,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  };
}

// Public URL for a stored asset. Protected assets always carry the tiled
// watermark and a signature; there is no code path that signs them bare.
export function deliveryUrl(publicId, { protect, isPdf }) {
  const transformation = [{ width: 1600, height: 1600, crop: 'limit' }];
  if (protect) {
    transformation.push({
      overlay: { font_family: 'Arial', font_size: 30, font_weight: 'bold', text: WATERMARK },
      color: '#9a1c3a',
      opacity: 20,
      angle: -28,
      flags: 'tiled',
      x: 90,
      y: 120,
    });
  }
  transformation.push({ quality: 'auto:good' });

  return cloudinary.url(publicId, {
    type: typeFor(protect),
    sign_url: protect,
    format: 'jpg',
    ...(isPdf ? { page: 1 } : {}),
    transformation,
  });
}

// Server-side upload from a local path (used by the bulk importer).
export async function uploadFile(path, { protect }) {
  const r = await cloudinary.uploader.upload(path, {
    folder: folderFor(protect),
    type: typeFor(protect),
    resource_type: 'image',
  });
  return deliveryUrl(r.public_id, { protect, isPdf: r.format === 'pdf' });
}
