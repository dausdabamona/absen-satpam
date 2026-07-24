#!/usr/bin/env node
// Set field `scriptId` di .clasp.json ke bound script milik satu Google Sheet.
// Pakai: node scripts/bind-clasp.mjs <SCRIPT_ID>
//        npm run gas:bind -- <SCRIPT_ID>
//
// SCRIPT_ID BUKAN ID spreadsheet. Ambil dari sheet target:
//   Ekstensi -> Apps Script -> (ikon roda gigi) Setelan Project -> "ID" Script.
import { readFileSync, writeFileSync } from 'node:fs';

const scriptId = process.argv[2];
if (!scriptId) {
  console.error('Pakai: node scripts/bind-clasp.mjs <SCRIPT_ID>');
  console.error('Catatan: SCRIPT_ID = ID bound script (Setelan Project di editor Apps Script), bukan ID spreadsheet.');
  process.exit(1);
}
// Sanity check: ID spreadsheet biasanya diawali "1..." tapi begitu juga script id.
// Tolak kalau ada karakter yang jelas bukan bagian dari ID Apps Script.
if (!/^[A-Za-z0-9_-]{20,}$/.test(scriptId)) {
  console.error(`SCRIPT_ID tidak valid: "${scriptId}"`);
  console.error('Harusnya string panjang huruf/angka/-/_ tanpa spasi atau URL.');
  process.exit(1);
}

const path = '.clasp.json';
let cfg;
try {
  cfg = JSON.parse(readFileSync(path, 'utf8'));
} catch {
  cfg = {};
}
const lama = cfg.scriptId || '(kosong)';
cfg.scriptId = scriptId;
cfg.rootDir = cfg.rootDir || 'google-apps-script';
writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');

console.log(`.clasp.json diperbarui:`);
console.log(`  scriptId: ${lama} -> ${scriptId}`);
console.log(`  rootDir : ${cfg.rootDir}`);
console.log('Lanjut: npm run gas:status  lalu  npm run gas:push');
