// Image checks for uploads. The file type comes from the file's own first
// bytes, not from its name or the Content-Type the client claims.
export function detectImageType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Photos can carry the GPS position they were taken at in their metadata
// (threat model asset 4). species-media is a public bucket, so the metadata
// is removed before the file is stored. The picture itself is not touched.
export function stripMetadata(buf, type) {
  if (type === 'image/jpeg') return stripJpeg(buf);
  if (type === 'image/png') return stripPng(buf);
  if (type === 'image/webp') return stripWebp(buf);
  return buf;
}

// JPEG: drop APP1 (EXIF, XMP), APP13 (IPTC) and COM segments before the image data.
function stripJpeg(buf) {
  const keep = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xda) break; // start of scan: the rest is image data
    const end = i + 2 + buf.readUInt16BE(i + 2);
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) keep.push(buf.subarray(i, end));
    i = end;
  }
  keep.push(buf.subarray(i));
  return Buffer.concat(keep);
}

// PNG: drop eXIf and the text chunks (tEXt, zTXt, iTXt, which can hold XMP).
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt']);
function stripPng(buf) {
  const keep = [PNG_SIGNATURE];
  let i = 8;
  while (i + 12 <= buf.length) {
    const end = i + 12 + buf.readUInt32BE(i);
    if (!PNG_DROP.has(buf.toString('latin1', i + 4, i + 8))) keep.push(buf.subarray(i, end));
    i = end;
  }
  return Buffer.concat(keep);
}

// WebP: drop the EXIF and XMP chunks, clear their flags in VP8X, fix the size.
function stripWebp(buf) {
  const keep = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const id = buf.toString('latin1', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const end = i + 8 + size + (size % 2);
    if (id !== 'EXIF' && id !== 'XMP ') {
      const chunk = Buffer.from(buf.subarray(i, end));
      if (id === 'VP8X') chunk[8] &= ~0x0c; // flags byte: 0x08 EXIF, 0x04 XMP
      keep.push(chunk);
    }
    i = end;
  }
  const body = Buffer.concat(keep);
  const header = Buffer.from(buf.subarray(0, 12));
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}
