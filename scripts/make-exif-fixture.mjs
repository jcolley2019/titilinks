// MEDIA.PHOTO.2 — build tests/fixtures/exif-rotated.jpg: a ~1600×1200 JPEG whose
// EXIF says Orientation = 6 (rotate 90° CW to display → shows as 1200×1600) and
// which carries a GPS IFD (lat 37°46'30"N, long 122°25'10"W). Spec 86 pushes it
// through the Gallery editor and proves the stored WebP is 1200×1600 with no
// EXIF and no GPS left in it.
//
// No sharp in node_modules, and no JPEG fixture in the repo to splice into, so
// the baseline JPEG is rendered by headless Chromium (Playwright is already a
// devDependency) and the APP1 Exif segment is hand-built here and inserted
// right after SOI. Run once:
//   node scripts/make-exif-fixture.mjs
// Deterministic apart from Chromium's JPEG encoder; the fixture is committed.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../tests/fixtures/exif-rotated.jpg');
const W = 1600;
const H = 1200;

/** Baseline JPEG, W×H, drawn with an unmistakable "up" marker so a viewer that
 *  honours orientation shows the arrow pointing right (90° CW), not up. */
async function renderBaseJpeg() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const dataUrl = await page.evaluate(({ w, h }) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#1f3a5f'); g.addColorStop(0.5, '#c9a55c'); g.addColorStop(1, '#5a1f3f');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      // Photographic-ish texture so the JPEG is not trivially compressible.
      for (let i = 0; i < 4000; i++) {
        x.fillStyle = `hsla(${(i * 37) % 360}, 60%, ${40 + (i % 40)}%, 0.35)`;
        x.beginPath();
        x.arc((i * 7919) % w, (i * 104729) % h, 6 + (i % 23), 0, Math.PI * 2);
        x.fill();
      }
      // "UP" arrow on the sensor's top edge.
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.moveTo(w / 2, 60); x.lineTo(w / 2 - 120, 300); x.lineTo(w / 2 + 120, 300); x.closePath(); x.fill();
      x.fillRect(w / 2 - 40, 300, 80, 260);
      x.font = 'bold 110px sans-serif'; x.textAlign = 'center';
      x.fillText('TOP', w / 2, 720);
      return c.toDataURL('image/jpeg', 0.9);
    }, { w: W, h: H });
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  } finally {
    await browser.close();
  }
}

/** A little-endian TIFF with IFD0 { Orientation=6, GPSInfo→GPS IFD } and a GPS
 *  IFD { VersionID, LatitudeRef N, Latitude 37/46/30, LongitudeRef W, Longitude 122/25/10 }. */
function buildExifApp1() {
  const SHORT = 3, LONG = 4, ASCII = 2, BYTE = 1, RATIONAL = 5;
  const entries0 = 2;
  const entriesGps = 5;
  const ifd0Off = 8;
  const ifd0Len = 2 + entries0 * 12 + 4;
  const gpsOff = ifd0Off + ifd0Len;
  const gpsLen = 2 + entriesGps * 12 + 4;
  const latOff = gpsOff + gpsLen;          // 3 rationals = 24 bytes
  const lonOff = latOff + 24;
  const tiffLen = lonOff + 24;

  const tiff = Buffer.alloc(tiffLen);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(ifd0Off, 4);

  let p = ifd0Off;
  tiff.writeUInt16LE(entries0, p); p += 2;
  const entry = (tag, type, count, valueOrOffset, inline) => {
    tiff.writeUInt16LE(tag, p); tiff.writeUInt16LE(type, p + 2); tiff.writeUInt32LE(count, p + 4);
    if (inline === 'short') tiff.writeUInt16LE(valueOrOffset, p + 8);
    else if (inline === 'ascii2') tiff.write(valueOrOffset, p + 8, 'ascii');
    else if (inline === 'bytes') Buffer.from(valueOrOffset).copy(tiff, p + 8);
    else tiff.writeUInt32LE(valueOrOffset, p + 8);
    p += 12;
  };
  entry(0x0112, SHORT, 1, 6, 'short');         // Orientation = 6
  entry(0x8825, LONG, 1, gpsOff);              // GPSInfoIFDPointer
  tiff.writeUInt32LE(0, p); p += 4;            // next IFD = none

  p = gpsOff;
  tiff.writeUInt16LE(entriesGps, p); p += 2;
  entry(0x0000, BYTE, 4, [2, 3, 0, 0], 'bytes'); // GPSVersionID
  entry(0x0001, ASCII, 2, 'N\0', 'ascii2');      // GPSLatitudeRef
  entry(0x0002, RATIONAL, 3, latOff);            // GPSLatitude
  entry(0x0003, ASCII, 2, 'W\0', 'ascii2');      // GPSLongitudeRef
  entry(0x0004, RATIONAL, 3, lonOff);            // GPSLongitude
  tiff.writeUInt32LE(0, p);

  const rational = (off, [d, m, s]) => {
    tiff.writeUInt32LE(d, off); tiff.writeUInt32LE(1, off + 4);
    tiff.writeUInt32LE(m, off + 8); tiff.writeUInt32LE(1, off + 12);
    tiff.writeUInt32LE(s, off + 16); tiff.writeUInt32LE(1, off + 20);
  };
  rational(latOff, [37, 46, 30]);
  rational(lonOff, [122, 25, 10]);

  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const seg = Buffer.alloc(4);
  seg.writeUInt16BE(0xffe1, 0);
  seg.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([seg, payload]);
}

const base = await renderBaseJpeg();
if (base[0] !== 0xff || base[1] !== 0xd8) throw new Error('not a JPEG (no SOI)');
const app1 = buildExifApp1();
const jpeg = Buffer.concat([base.subarray(0, 2), app1, base.subarray(2)]);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, jpeg);
console.log(`wrote ${out}: ${jpeg.length} bytes (${W}×${H}, Orientation=6, GPS IFD, APP1 ${app1.length} bytes)`);
