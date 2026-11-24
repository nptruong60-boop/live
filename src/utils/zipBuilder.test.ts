import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZipArchive, crc32 } from './zipBuilder';

test('crc32 matches standard IEEE 802.3 check vector "123456789"', () => {
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(crc32(bytes), 0xcbf43926);
});

test('buildZipArchive produces valid PKZIP headers and EOCD with UTF-8 paths', () => {
  const zip = buildZipArchive(
    [
      { path: 'PocketLive_Studio/README.txt', content: 'Hướng dẫn cài đặt nhanh' },
      { path: 'PocketLive_Studio/data/config.json', content: '{"ok":true}' },
    ],
    new Date('2026-11-24T10:30:00Z')
  );

  // Local file header signature: PK\x03\x04
  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4b);
  assert.equal(zip[2], 0x03);
  assert.equal(zip[3], 0x04);

  // UTF-8 general purpose bit 11 (0x0800)
  const flags = zip[6] | (zip[7] << 8);
  assert.equal((flags & 0x0800) !== 0, true);

  // End of central directory signature at last 22 bytes: PK\x05\x06
  const eocdOffset = zip.length - 22;
  assert.equal(zip[eocdOffset], 0x50);
  assert.equal(zip[eocdOffset + 1], 0x4b);
  assert.equal(zip[eocdOffset + 2], 0x05);
  assert.equal(zip[eocdOffset + 3], 0x06);

  // Entry count = 2
  const entryCount = zip[eocdOffset + 8] | (zip[eocdOffset + 9] << 8);
  assert.equal(entryCount, 2);

  // Embedded text content is intact
  const decoded = new TextDecoder().decode(zip);
  assert.equal(decoded.includes('Hướng dẫn cài đặt nhanh'), true);
  assert.equal(decoded.includes('{"ok":true}'), true);
});
