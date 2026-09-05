// TL.STOR.7 — unit test for src/lib/user-fonts.ts plus the drift check that
// pins migration 20260905130000's fonts-bucket allowed_mime_types to
// FONT_MIME_TYPES. Same convention as brand.test.mjs: standalone node script
// run with `npx tsx`, node:assert/strict, no network. Run:
//   npx tsx scripts/user-fonts.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  FONT_MIME_TYPES,
  MAX_FONT_BYTES,
  fontContentType,
  validateFontFile,
} from '../src/lib/user-fonts';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

const EXPECTED_MIMES = [
  'font/ttf', 'application/x-font-ttf', 'application/font-sfnt',
  'font/otf', 'application/x-font-opentype',
  'font/woff', 'application/font-woff',
  'font/woff2', 'application/font-woff2',
];

// 1. Windows-reported generic MIMEs are accepted when the extension is a font.
assert.equal(validateFontFile({ name: 'Brand.TTF', type: '', size: 1000 }), null);
assert.equal(validateFontFile({ name: 'Brand.TTF', type: 'application/octet-stream', size: 1000 }), null);
ok('validateFontFile: Windows generic MIMEs pass on a .TTF');

// 2. Refusals.
assert.equal(validateFontFile({ name: 'x.html', type: 'text/html', size: 10 }), 'invalidType');
assert.equal(validateFontFile({ name: 'a.ttf', type: 'text/html', size: 10 }), 'invalidType');
assert.equal(validateFontFile({ name: 'a.ttf', type: 'font/ttf', size: MAX_FONT_BYTES + 1 }), 'tooLarge');
assert.equal(MAX_FONT_BYTES, 10 * 1024 * 1024);
ok('validateFontFile: non-font extension, mismatched MIME, and 10 MB + 1 refused');

// 3. Content-Type by extension.
assert.equal(fontContentType('Brand.TTF'), 'font/ttf');
assert.equal(fontContentType('a.otf'), 'font/otf');
assert.equal(fontContentType('a.woff'), 'font/woff');
assert.equal(fontContentType('a.woff2'), 'font/woff2');
assert.equal(fontContentType('a.html'), null);
ok('fontContentType: extension -> canonical MIME, null for non-fonts');

// 4. FONT_MIME_TYPES is exactly the nine values, in declaration order.
assert.equal(FONT_MIME_TYPES.length, 9);
assert.deepEqual(FONT_MIME_TYPES, EXPECTED_MIMES);
ok('FONT_MIME_TYPES: nine values in declaration order');

// 5. Drift check: the migration's array[...] must equal FONT_MIME_TYPES.
const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(here, '..', 'supabase', 'migrations', '20260905130000_stor7_secgrants1.sql');
const sql = readFileSync(migrationPath, 'utf8');
const update = sql.match(/update storage\.buckets\s+set allowed_mime_types = array\[([\s\S]*?)\]\s+where id = 'fonts';/);
assert.ok(update, 'migration must contain the storage.buckets allowed_mime_types update for fonts');
const body = update[1];
// Strict tokenizer: inside the brackets, quoted strings and commas must
// alternate and nothing else may appear, so a stray or missing entry cannot hide.
const tokens = body.match(/'[^']*'|,|\S+/g) ?? [];
const migrationMimes = [];
for (let i = 0; i < tokens.length; i++) {
  const t = tokens[i];
  if (i % 2 === 0) {
    assert.match(t, /^'[^']+'$/, `array token ${i} must be a quoted MIME, got ${JSON.stringify(t)}`);
    migrationMimes.push(t.slice(1, -1));
  } else {
    assert.equal(t, ',', `array token ${i} must be a comma, got ${JSON.stringify(t)}`);
  }
}
assert.deepEqual(
  migrationMimes,
  FONT_MIME_TYPES,
  'migration 20260905130000 allowed_mime_types drifted from FONT_MIME_TYPES (src/lib/user-fonts.ts)',
);
ok(`migration 20260905130000 allowed_mime_types matches FONT_MIME_TYPES (${migrationMimes.length} entries, same order)`);

console.log(`\nuser-fonts ${passed}/${passed} passed`);
