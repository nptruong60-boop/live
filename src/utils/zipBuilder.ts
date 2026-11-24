/**
 * Pure TypeScript PKZIP (Store / Method 0) archive builder with full UTF-8 support.
 * Zero external dependencies — works identically in browser and Node.js.
 */

export interface ZipEntryInput {
  /** Forward-slash relative path inside the archive, e.g. "PocketLive_Studio/README.txt" */
  path: string;
  /** UTF-8 text or raw bytes */
  content: string | Uint8Array;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

function writeUint16LE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
}

function writeUint32LE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
  buf[offset + 2] = (val >>> 16) & 0xff;
  buf[offset + 3] = (val >>> 24) & 0xff;
}

/**
 * Builds a standards-compliant .zip binary (Uint8Array) from a list of files.
 * Sets General Purpose Bit 11 (0x0800) so Windows Explorer and macOS Finder decode UTF-8 filenames properly.
 */
export function buildZipArchive(entries: ZipEntryInput[], now: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { dosTime, dosDate } = getDosDateTime(now);
  const UTF8_FLAG = 0x0800;

  interface PreparedEntry {
    nameBytes: Uint8Array;
    dataBytes: Uint8Array;
    crc: number;
    localHeaderOffset: number;
  }

  const prepared: PreparedEntry[] = [];
  let localSectionSize = 0;

  for (const entry of entries) {
    const cleanPath = entry.path.replace(/^\/+/, '').replace(/\\/g, '/');
    const nameBytes = encoder.encode(cleanPath);
    const dataBytes =
      typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content;
    const crc = crc32(dataBytes);
    prepared.push({
      nameBytes,
      dataBytes,
      crc,
      localHeaderOffset: localSectionSize,
    });
    localSectionSize += 30 + nameBytes.length + dataBytes.length;
  }

  let centralDirSize = 0;
  for (const item of prepared) {
    centralDirSize += 46 + item.nameBytes.length;
  }

  const totalSize = localSectionSize + centralDirSize + 22;
  const out = new Uint8Array(totalSize);
  let pos = 0;

  // 1. Local file headers + raw file data
  for (const item of prepared) {
    writeUint32LE(out, pos, 0x04034b50); // Local file header signature
    writeUint16LE(out, pos + 4, 20); // Version needed to extract (2.0)
    writeUint16LE(out, pos + 6, UTF8_FLAG); // UTF-8 filename flag
    writeUint16LE(out, pos + 8, 0); // Compression method: 0 (STORE)
    writeUint16LE(out, pos + 10, dosTime);
    writeUint16LE(out, pos + 12, dosDate);
    writeUint32LE(out, pos + 14, item.crc);
    writeUint32LE(out, pos + 18, item.dataBytes.length);
    writeUint32LE(out, pos + 22, item.dataBytes.length);
    writeUint16LE(out, pos + 26, item.nameBytes.length);
    writeUint16LE(out, pos + 28, 0); // Extra field length
    pos += 30;

    out.set(item.nameBytes, pos);
    pos += item.nameBytes.length;

    out.set(item.dataBytes, pos);
    pos += item.dataBytes.length;
  }

  const centralDirOffset = pos;

  // 2. Central directory records
  for (const item of prepared) {
    writeUint32LE(out, pos, 0x02014b50); // Central directory signature
    writeUint16LE(out, pos + 4, 20); // Version made by
    writeUint16LE(out, pos + 6, 20); // Version needed
    writeUint16LE(out, pos + 8, UTF8_FLAG); // UTF-8 flag
    writeUint16LE(out, pos + 10, 0); // Compression method: STORE
    writeUint16LE(out, pos + 12, dosTime);
    writeUint16LE(out, pos + 14, dosDate);
    writeUint32LE(out, pos + 16, item.crc);
    writeUint32LE(out, pos + 20, item.dataBytes.length);
    writeUint32LE(out, pos + 24, item.dataBytes.length);
    writeUint16LE(out, pos + 28, item.nameBytes.length);
    writeUint16LE(out, pos + 30, 0); // Extra field length
    writeUint16LE(out, pos + 32, 0); // Comment length
    writeUint16LE(out, pos + 34, 0); // Disk number start
    writeUint16LE(out, pos + 36, 0); // Internal attrs
    writeUint32LE(out, pos + 38, 0); // External attrs
    writeUint32LE(out, pos + 42, item.localHeaderOffset);
    pos += 46;

    out.set(item.nameBytes, pos);
    pos += item.nameBytes.length;
  }

  // 3. End of central directory record (EOCD)
  writeUint32LE(out, pos, 0x06054b50);
  writeUint16LE(out, pos + 4, 0); // Disk number
  writeUint16LE(out, pos + 6, 0); // Disk where central dir starts
  writeUint16LE(out, pos + 8, prepared.length);
  writeUint16LE(out, pos + 10, prepared.length);
  writeUint32LE(out, pos + 12, centralDirSize);
  writeUint32LE(out, pos + 16, centralDirOffset);
  writeUint16LE(out, pos + 20, 0); // ZIP comment length

  return out;
}
