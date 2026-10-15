import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

// The ledger owns existing locations. New attempts begin in in-progress/.
export function modelFile(slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`Invalid model slug: ${slug}`);
  const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json')));
  const files = catalog.designs.flatMap(row => [row.model, ...(row.additionalModels ?? [])]).filter(Boolean);
  return files.find(file => path.basename(file) === `${slug}.osf`)
    ?? `../2026-10-13-origami-fold-trials/models/in-progress/${slug}.osf`;
}

export function modelPath(slug) {
  return path.resolve(dir, modelFile(slug));
}
