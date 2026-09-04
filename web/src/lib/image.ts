/**
 * Reads pixel dimensions from PNG / JPEG / GIF / WebP headers without
 * decoding the image. Returns null when the format is unknown.
 */
export function imageDimensions(
  buf: Uint8Array,
): { width: number; height: number } | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 24) return null;

  // PNG: 8-byte signature, IHDR chunk with width/height at offset 16/20.
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }

  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  }

  // WebP (VP8 / VP8L / VP8X)
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45
  ) {
    const chunk = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
    if (chunk === "VP8 " && buf.length >= 30) {
      return {
        width: dv.getUint16(26, true) & 0x3fff,
        height: dv.getUint16(28, true) & 0x3fff,
      };
    }
    if (chunk === "VP8L" && buf.length >= 25) {
      const b = dv.getUint32(21, true);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X" && buf.length >= 30) {
      const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
      const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
      return { width: w + 1, height: h + 1 };
    }
    return null;
  }

  // JPEG: walk segments until a SOF marker.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
        off += 2;
        continue;
      }
      const len = dv.getUint16(off + 2);
      const isSOF =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;
      if (isSOF) {
        return {
          height: dv.getUint16(off + 5),
          width: dv.getUint16(off + 7),
        };
      }
      off += 2 + len;
    }
  }
  return null;
}

export function sniffContentType(buf: Uint8Array, fallback: string): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57) return "image/webp";
  return fallback;
}

export const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function extensionFor(type: string): string {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}
