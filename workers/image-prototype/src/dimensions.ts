/**
 * Cheap, dependency-free image dimension sniffing for JPEG, PNG, and WebP.
 * Used to compute the no-upscale target before handing bytes to the WASM
 * engine. Returns null for anything unrecognized or too short to inspect.
 * Cross-validated against the WASM decoder in the test suite.
 */

export interface Dimensions {
  width: number;
  height: number;
}

const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);

export function getImageDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 24) return null;

  // PNG signature
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }

  // JPEG SOI
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return jpegDimensions(bytes);
  }

  // WebP RIFF....WEBP
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return webpDimensions(bytes);
  }

  return null;
}

function jpegDimensions(b: Uint8Array): Dimensions | null {
  const len = b.length;
  let i = 2;
  while (i + 4 <= len) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    if (b[i + 1] === 0xff) {
      i++; // fill byte
      continue;
    }
    const marker = b[i + 1];
    // Standalone markers (no length field).
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (i + 4 > len) return null;
    const segLen = (b[i + 2] << 8) | b[i + 3];
    if (segLen < 2) return null;
    // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > len) return null;
      const height = (b[i + 5] << 8) | b[i + 6];
      const width = (b[i + 7] << 8) | b[i + 8];
      return { width, height };
    }
    i += 2 + segLen;
  }
  return null;
}

function webpDimensions(b: Uint8Array): Dimensions | null {
  const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (fourcc === "VP8X" && b.length >= 30) {
    // Extended: 24-bit width-1 / height-1.
    const width = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1;
    const height = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1;
    return { width, height };
  }
  if (fourcc === "VP8 " && b.length >= 30) {
    // Lossy: 14-bit little-endian.
    const width = u16le(b, 26) & 0x3fff;
    const height = u16le(b, 28) & 0x3fff;
    return { width, height };
  }
  if (fourcc === "VP8L" && b.length >= 26) {
    // Lossless: 14-bit width-1 / height-1 packed across 4 bytes.
    const width = (b[21] | (b[22] << 8) | ((b[23] & 0x3f) << 16)) + 1;
    const height = (((b[23] >> 6) & 0x3) | (b[24] << 2) | ((b[25] & 0x0f) << 10)) + 1;
    return { width, height };
  }
  return null;
}
