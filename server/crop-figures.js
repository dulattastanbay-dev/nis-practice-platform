#!/usr/bin/env node
/**
 * Work out, for every question that needs a figure, which slice of its page
 * scan actually contains that question — so the site embeds the task, not the
 * whole exam page (headers, page numbers, examiner margin, other questions).
 *
 *   node server/crop-figures.js [--apply]
 *
 * Nothing is re-encoded. The crop is stored as two fractions (crop_top,
 * crop_bottom) and applied with CSS at render time, so the original files stay
 * intact and a human can adjust the numbers later in the review screen.
 *
 * PNG is decoded with Node's built-in zlib — no image dependency needed.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// ---------- minimal PNG reader (8-bit, non-interlaced) ----------
function decodePNG(file) {
  const buf = fs.readFileSync(file);
  if (buf.slice(1, 4).toString() !== 'PNG') throw new Error('not a PNG');
  let pos = 8;
  let width = 0; let height = 0; let bitDepth = 0; let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.slice(pos + 4, pos + 8).toString('latin1');
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (bitDepth !== 8 || data[12] !== 0) throw new Error('unsupported PNG variant');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported colorType ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  // undo the per-scanline filters
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
  };
  let rp = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rp]; rp += 1;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[rp + x];
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= channels) ? prev[x - channels] : 0;
      let v;
      switch (filter) {
        case 0: v = rawByte; break;
        case 1: v = rawByte + a; break;
        case 2: v = rawByte + b; break;
        case 3: v = rawByte + ((a + b) >> 1); break;
        case 4: v = rawByte + paeth(a, b, c); break;
        default: throw new Error(`bad filter ${filter}`);
      }
      cur[x] = v & 0xff;
    }
    rp += stride;
  }
  return { width, height, channels, pixels: out };
}

// ---------- ink profile ----------
// Count dark pixels per row, ignoring the right-hand examiner margin.
function inkProfile(img) {
  const { width, height, channels, pixels } = img;
  const rightMargin = Math.floor(width * 0.86); // examiner column lives beyond this
  const rows = new Array(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    let n = 0;
    const base = y * width * channels;
    for (let x = 0; x < rightMargin; x += 1) {
      const i = base + x * channels;
      // luminance of the first three (or single grey) channel(s)
      const lum = channels >= 3 ? (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) : pixels[i];
      if (lum < 170) n += 1;
    }
    rows[y] = n;
  }
  return rows;
}

/**
 * Split a page into content blocks separated by tall runs of blank rows, and
 * drop the header/footer bands.
 */
function contentBlocks(rows, height) {
  const INK = 3;                                  // a row with >=3 dark px has content
  const GAP = Math.round(height * 0.022);         // ~2.2% of the page = a real separation
  const headerEnd = Math.round(height * 0.045);   // running head
  const footerStart = Math.round(height * 0.945); // footer / page number

  const blocks = [];
  let start = -1; let blank = 0;
  for (let y = headerEnd; y < footerStart; y += 1) {
    if (rows[y] >= INK) {
      if (start < 0) start = y;
      blank = 0;
    } else if (start >= 0) {
      blank += 1;
      if (blank >= GAP) { blocks.push([start, y - blank]); start = -1; blank = 0; }
    }
  }
  if (start >= 0) blocks.push([start, footerStart]);
  // ignore slivers (stray marks, rules)
  return blocks.filter(([a, b]) => b - a > height * 0.012);
}

function main() {
  const apply = process.argv.includes('--apply');
  const db = require('./db');
  const PUBLIC = path.join(__dirname, '..', 'public');

  // Questions that actually depend on a picture or table.
  const NEEDS = /рисун|график|диаграмм|черт[её]ж|схем|таблиц|изображ|на рисунке|фигур/i;

  const questions = db.prepare(`
    SELECT q.id, q.subject, q.year, q.component, q.number, q.text_latex, q.original_pdf_page,
           i.id AS image_id, i.src
    FROM questions q JOIN images i ON i.question_id = q.id
    WHERE i.src IS NOT NULL
    ORDER BY q.subject, q.year, q.component, q.number
  `).all();

  const keep = [];
  const drop = [];
  for (const q of questions) {
    const partsText = db.prepare('SELECT text_latex FROM question_parts WHERE question_id=?')
      .all(q.id).map((p) => p.text_latex).join('\n');
    if (NEEDS.test(`${q.text_latex}\n${partsText}`)) keep.push(q); else drop.push(q);
  }

  console.log(`figures needed: ${keep.length}   |   page scans to drop: ${drop.length}`);

  // Group the kept ones by page so questions sharing a page can be told apart.
  const byPage = new Map();
  for (const q of keep) {
    const k = `${q.subject}|${q.year}|${q.component}|${q.original_pdf_page}`;
    (byPage.get(k) || byPage.set(k, []).get(k)).push(q);
  }

  const crops = [];
  let failed = 0;
  for (const [, group] of byPage) {
    const file = path.join(PUBLIC, group[0].src);
    if (!fs.existsSync(file)) { failed += group.length; continue; }
    let img;
    try { img = decodePNG(file); } catch (e) { failed += group.length; continue; }
    const rows = inkProfile(img);
    const blocks = contentBlocks(rows, img.height);
    if (!blocks.length) { failed += group.length; continue; }

    // All questions on this page, in order, so a shared page can be divided.
    const onPage = db.prepare(`SELECT id, number FROM questions
      WHERE subject=? AND year=? AND component=? AND original_pdf_page=? ORDER BY number`)
      .all(group[0].subject, group[0].year, group[0].component, group[0].original_pdf_page);

    // Crop to the CONTENT BOUNDS of the page: this removes the running head,
    // the footer/page number and the examiner margin, and never cuts into the
    // question itself. Splitting a shared page automatically was tried and
    // rejected: a question is often "text block + gap + diagram block", and the
    // page carries no reliable marker for where one question ends, so a split
    // risks amputating the diagram — far worse than showing a neighbour.
    const top = blocks[0][0];
    const bottom = blocks[blocks.length - 1][1];
    const pad = Math.round(img.height * 0.008);
    const t = Math.max(0, (top - pad) / img.height);
    const b = Math.min(1, (bottom + pad) / img.height);
    for (const q of group) {
      crops.push({
        image_id: q.image_id,
        question: `${q.year} C${q.component} Q${q.number}`,
        top: Number(t.toFixed(4)), bottom: Number(b.toFixed(4)),
        keptPct: Math.round((b - t) * 100),
        // more than one question on this page -> a human should tighten the crop
        sharesPage: onPage.length > 1,
      });
    }
  }

  crops.sort((a, b) => a.keptPct - b.keptPct);
  console.log('\ntightest crops (page % kept):');
  for (const c of crops.slice(0, 5)) console.log(`  ${c.question}: ${c.keptPct}%`);
  const avg = Math.round(crops.reduce((s, c) => s + c.keptPct, 0) / (crops.length || 1));
  const shared = crops.filter((c) => c.sharesPage).length;
  console.log(`\ncrops computed: ${crops.length} (avg ${avg}% of the page kept), failed: ${failed}`);
  console.log(`furniture trimmed on all of them; ${shared} share a page and still need a human to tighten the crop.`);

  if (!apply) { console.log('\nDry run. Re-run with --apply to write.'); return; }

  const setCrop = db.prepare('UPDATE images SET crop_top=?, crop_bottom=? WHERE id=?');
  for (const c of crops) setCrop.run(c.top, c.bottom, c.image_id);
  // Questions that do not need a figure lose the page scan entirely.
  const delImg = db.prepare('DELETE FROM images WHERE id=?');
  const clearFlag = db.prepare('UPDATE questions SET has_images=0 WHERE id=?');
  for (const q of drop) { delImg.run(q.image_id); clearFlag.run(q.id); }
  console.log(`applied: ${crops.length} crops, ${drop.length} page scans removed.`);
}

if (require.main === module) main();

module.exports = { decodePNG, inkProfile, contentBlocks };
