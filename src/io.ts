import { open, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { InputError } from './model.js';

export async function readJson(path: string, limit = 512 * 1024): Promise<unknown> {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new InputError(`Berkas harus file biasa dengan ukuran maksimal ${limit} byte: ${path}`);
    // Baca terbatas, termasuk bila file membesar setelah stat.
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const chunk = await handle.read(bytes, length, bytes.length - length, null);
      if (!chunk.bytesRead) break;
      length += chunk.bytesRead;
    }
    if (length > limit) throw new InputError(`Berkas melebihi batas ukuran: ${path}`);
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)); }
    catch { throw new InputError(`Berkas bukan UTF-8 yang valid: ${path}`); }
    try { return JSON.parse(content) as unknown; }
    catch { throw new InputError(`JSON tidak valid: ${path}`); }
  } finally { await handle.close(); }
}

/** Reservasi direktori secara eksklusif; kegagalan dibersihkan tanpa menyentuh direktori lama. */
export async function writeBundle(destination: string, files: Record<string, string>): Promise<string> {
  const path = resolve(destination);
  if (!basename(path) || path === dirname(path)) throw new InputError('Direktori output tidak valid.');
  await mkdir(path); // EEXIST sengaja ditolak: tidak menimpa hasil atau symlink.
  try {
    for (const [name, content] of Object.entries(files)) await writeFile(join(path, name), content, { encoding: 'utf8', flag: 'wx' });
    return path;
  } catch (error) {
    await rm(path, { recursive: true, force: true }); throw error;
  }
}
