/* Lab report files (this fork): the PDF or photo a blood test came on, one per lab result, kept at
 * DATA_DIR/medical/files/<uid>/<random id>.<ext> (mode 0600). The lab result itself names it
 * ({ file: { id, name, type, size, at } }, store.js), so only its owner's session ever finds it.
 *
 * Upload without multipart (no dependency for it): JSON with the bytes as base64. The API and the
 * web image's nginx take 5 MiB per request (MAX_BODY in server.js, client_max_body_size), and a
 * report may be up to 10 MB, so a file larger than one piece arrives in pieces of at most CHUNK_MAX
 * bytes (4 MiB once base64), in order: the first carries the type, name and total size and is
 * answered with an upload id, each next one names that id and the offset it starts at. Raising the
 * body limit for this one route would have needed every reverse proxy in front of a self-hosted
 * server to raise its own limit too; pieces fit through what already works.
 *
 * Pieces wait in `<upload id>.partial` beside the files (backups.js and the data browser skip that
 * suffix) and are dropped after UPLOAD_IDLE_MS without a next one. A finished file must start with
 * the magic bytes of its declared type, or it is refused. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const FILE_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
export const TYPE_OF_EXT = Object.fromEntries(Object.entries(FILE_TYPES).map(([t, e]) => [e, t]));
export const FILE_MAX = 10 * 1024 * 1024;
export const CHUNK_MAX = 3 * 1024 * 1024;
// Everything one profile may keep here: 30 full-size reports, far more of the usual 1 MB ones.
export const USER_MAX = 300 * 1024 * 1024;
export const UPLOAD_IDLE_MS = 15 * 60 * 1000;
export const UPLOADS_PER_USER = 2;
export const FILE_ID = /^[a-f0-9]{24}\.(pdf|jpg|png)$/;
const UPLOAD_ID = /^[a-f0-9]{24}$/;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const safeUid = uid => String(uid || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

/** Whether `buf` starts the way a file of `type` does. */
export function sniffOk(type, buf) {
  if (!buf || buf.length < 4) return false;
  if (type === 'application/pdf') return buf.subarray(0, 5).toString('latin1') === '%PDF-';
  if (type === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (type === 'image/png') return buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return false;
}

/** A display name for the file: its base name only, no control or quote characters, at most 120. */
export function cleanName(v, type) {
  const base = String(typeof v === 'string' ? v : '').split(/[\\/]/).pop()
    .replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '').trim().slice(0, 120);
  return base || 'report.' + FILE_TYPES[type];
}

/** base64 text to bytes, refusing anything that is not base64 or is larger than one piece. */
export function decodeChunk(data) {
  if (typeof data !== 'string' || !data || data.length > Math.ceil(CHUNK_MAX / 3) * 4 || data.length % 4 !== 0 || !B64.test(data)) {
    throw fail(400, `data must be base64, at most ${CHUNK_MAX} bytes per piece`, 'data');
  }
  return Buffer.from(data, 'base64');
}

export function createLabFiles({ dir, now = Date.now }) {
  const uploads = new Map();
  const userDir = uid => {
    const u = safeUid(uid);
    if (!u) throw fail(400, 'no profile', 'uid');
    return path.join(dir, u);
  };

  /** The absolute path of one of this profile's files, or null for a name that is not one. */
  function fileOf(uid, id) {
    if (typeof id !== 'string' || !FILE_ID.test(id)) return null;
    const base = userDir(uid);
    const full = path.join(base, id);
    return full.startsWith(base + path.sep) ? full : null;
  }

  function used(uid) {
    let total = 0;
    try {
      for (const d of fs.readdirSync(userDir(uid), { withFileTypes: true })) {
        if (d.isFile()) try { total += fs.statSync(path.join(userDir(uid), d.name)).size; } catch { /* gone */ }
      }
    } catch { /* no folder yet */ }
    return total;
  }

  function drop(up) {
    uploads.delete(up.id);
    try { fs.unlinkSync(up.tmp); } catch { /* gone */ }
  }
  function sweep() {
    for (const up of [...uploads.values()]) if (now() - up.at > UPLOAD_IDLE_MS) drop(up);
  }

  // The whole file is here: check it and keep it under a fresh name. Returns the file's record.
  function finish(uid, meta, buf) {
    if (buf.length !== meta.size) throw fail(400, 'the file is not the size it said', 'size');
    if (!sniffOk(meta.type, buf)) throw fail(400, 'the file is not a ' + FILE_TYPES[meta.type].toUpperCase(), 'type');
    if (used(uid) + buf.length > USER_MAX) throw fail(413, 'no room left for more report files on this server', 'quota');
    const base = userDir(uid);
    fs.mkdirSync(base, { recursive: true, mode: 0o700 });
    const id = crypto.randomBytes(12).toString('hex') + '.' + FILE_TYPES[meta.type];
    const full = path.join(base, id);
    const tmp = full + '.partial';
    fs.writeFileSync(tmp, buf, { mode: 0o600 });
    fs.renameSync(tmp, full);
    return { id, name: meta.name, type: meta.type, size: buf.length, at: new Date(now()).toISOString() };
  }

  /**
   * One request of an upload. `body`: { type, name, size?, data } for the first piece (size left
   * out: this piece is the whole file), { upload, offset, data } for each next one.
   * Answers { done: false, upload, received, size } until the last piece, then { done: true, file }.
   */
  function receive(uid, body) {
    sweep();
    const chunk = decodeChunk(body?.data);
    if (body?.upload !== undefined) {
      const up = typeof body.upload === 'string' && UPLOAD_ID.test(body.upload) ? uploads.get(body.upload) : null;
      if (!up || up.uid !== uid) throw fail(404, 'no such upload; start again', 'upload');
      if (body.offset !== up.received) throw fail(409, 'that piece is not the next one', 'offset');
      if (up.received + chunk.length > up.size) { drop(up); throw fail(400, 'more bytes than the file said', 'size'); }
      fs.appendFileSync(up.tmp, chunk);
      up.received += chunk.length;
      up.at = now();
      if (up.received < up.size) return { done: false, upload: up.id, received: up.received, size: up.size };
      let buf;
      try { buf = fs.readFileSync(up.tmp); } finally { drop(up); }
      return { done: true, file: finish(uid, up, buf), labId: up.labId };
    }
    const type = typeof body?.type === 'string' ? body.type.toLowerCase() : '';
    if (!FILE_TYPES[type]) throw fail(415, 'a report must be a PDF, JPEG or PNG', 'type');
    const size = body.size === undefined ? chunk.length : body.size;
    if (!Number.isInteger(size) || size < 1) throw fail(400, 'size must be the file size in bytes', 'size');
    if (size > FILE_MAX) throw fail(413, 'a report file is at most 10 MB', 'too-large');
    if (chunk.length > size) throw fail(400, 'more bytes than the file said', 'size');
    const meta = { type, name: cleanName(body.name, type), size, labId: body.labId };
    if (chunk.length === size) return { done: true, file: finish(uid, meta, chunk), labId: body.labId };
    const mine = [...uploads.values()].filter(u => u.uid === uid);
    if (mine.length >= UPLOADS_PER_USER) drop(mine.sort((a, b) => a.at - b.at)[0]);
    if (used(uid) + size > USER_MAX) throw fail(413, 'no room left for more report files on this server', 'quota');
    const base = userDir(uid);
    fs.mkdirSync(base, { recursive: true, mode: 0o700 });
    const id = crypto.randomBytes(12).toString('hex');
    const up = { ...meta, id, uid, received: chunk.length, tmp: path.join(base, id + '.partial'), at: now() };
    fs.writeFileSync(up.tmp, chunk, { mode: 0o600 });
    uploads.set(id, up);
    return { done: false, upload: id, received: up.received, size };
  }

  return {
    receive,
    fileOf,
    /** The bytes of one of this profile's files, or null. */
    read(uid, id) {
      const full = fileOf(uid, id);
      if (!full) return null;
      try {
        const st = fs.lstatSync(full);
        return st.isFile() ? fs.readFileSync(full) : null;
      } catch { return null; }
    },
    remove(uid, id) {
      const full = fileOf(uid, id);
      if (full) try { fs.unlinkSync(full); } catch { /* gone */ }
    },
    removeUser(uid) {
      for (const up of [...uploads.values()]) if (up.uid === uid) drop(up);
      const u = safeUid(uid);
      if (u) fs.rmSync(path.join(dir, u), { recursive: true, force: true });
    },
    _uploads: uploads,
  };
}
