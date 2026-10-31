import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export class ResourceImageError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const resourcePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 16, fieldSize: 20 * 1024, parts: 17 },
}).single('image');

export function resourcePayload(req) {
  if (!req.is('multipart/form-data')) return req.body || {};
  try {
    const value = req.body.data ? JSON.parse(req.body.data) : { ...req.body };
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    if (typeof value.eligibility === 'string') value.eligibility = JSON.parse(value.eligibility);
    if (value.removeImage === 'true') value.removeImage = true;
    return value;
  } catch { throw new ResourceImageError('Invalid resource form data.'); }
}

// Fully decode and re-encode: header checks alone allow corrupt files/polyglots.
// Limits also reject oversized decoded images, SVG, animations and image bombs.
export async function validateResourcePhoto(file) {
  if (!file) return null;
  if (!file.buffer.length || file.buffer.length > MAX_IMAGE_BYTES) throw new ResourceImageError('Choose an image no larger than 5 MB.');
  try {
    const options = { limitInputPixels: 32_000_000, failOn: 'warning' };
    const metadata = await sharp(file.buffer, options).metadata();
    const extension = { jpeg: 'jpg', png: 'png', webp: 'webp' }[metadata.format];
    if (!extension || (metadata.pages || 1) > 1) throw new Error();
    const buffer = await sharp(file.buffer, options).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).toFormat(metadata.format).toBuffer();
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error();
    return { buffer, filename: `${crypto.randomUUID()}.${extension}` };
  } catch { throw new ResourceImageError('Upload a valid, non-animated JPG, PNG or WebP image (up to 5 MB and 32 megapixels).'); }
}

const safeFilename = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp)$/;
export function resourcePhotoStorage(uploadDir) {
  const directory = path.join(uploadDir, 'resource-images');
  fs.mkdirSync(directory, { recursive: true });
  return {
    directory,
    write(photo) { if (photo) fs.writeFileSync(path.join(directory, photo.filename), photo.buffer, { flag: 'wx' }); },
    remove(filename) {
      if (!filename || !safeFilename.test(filename)) return;
      // A failed cleanup must never turn a committed save into an error.
      try { fs.unlinkSync(path.join(directory, filename)); } catch (error) { if (error.code !== 'ENOENT') console.warn('Unable to clean up a retired resource photo.'); }
    },
  };
}
export function withResourcePhoto(row) {
  const { imagePath, ...resource } = row;
  return { ...resource, imageUrl: imagePath && safeFilename.test(imagePath) ? `/resource-images/${imagePath}` : null };
}
export function registerResourcePhotoReadRoute(app, db, storage) {
  app.get('/api/resource-images/:filename', (req, res, next) => {
    const filename = req.params.filename;
    if (!safeFilename.test(filename) || !db.prepare('SELECT id FROM resources WHERE image_path = ?').get(filename)) return res.status(404).json({ error: 'Resource photo not found.' });
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(filename, { root: storage.directory, dotfiles: 'deny' }, error => {
      if (error && !res.headersSent) {
        if (error.code === 'ENOENT' || error.status === 404) return res.status(404).json({ error: 'Resource photo not found.' });
        next(error);
      }
    });
  });
}
