/* Uji logika inti backend (porting fungsi murni dari Code.gs).
   Jalankan: node test/logika-shift.test.js */
"use strict";

const SHIFT_DEF = {
  "I":   { mulai: 480,  selesai: 960 },
  "II":  { mulai: 960,  selesai: 1440 },
  "III": { mulai: 0,    selesai: 480 },
  "IV":  { mulai: 0,    selesai: 720 },
  "V":   { mulai: 720,  selesai: 1440 }
};
const JENDELA_MENIT = 240;

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function ymdKeDayNum(ymd) {
  const p = ymd.split("-").map(Number);
  return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
}
function tambahHari(ymd, n) {
  const p = ymd.split("-").map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}
function menitAbsolut(ymd, menit) { return ymdKeDayNum(ymd) * 1440 + menit; }

// jadwal: {id: {"YYYY-MM-DD": kode}}
function shiftEfektif(jadwal, id, ymd) { return (jadwal[id] && jadwal[id][ymd]) || "-"; }

function tentukanAbsen(jadwal, personelId, nowYmd, nowMin, set) {
  const nowAbs = menitAbsolut(nowYmd, nowMin);
  const kandidat = [];
  [-1, 0, 1].forEach(function (n) {
    const d = tambahHari(nowYmd, n);
    const kode = shiftEfektif(jadwal, personelId, d);
    const def = SHIFT_DEF[kode];
    if (!def) return;
    const start = menitAbsolut(d, def.mulai);
    const end = menitAbsolut(d, def.selesai);
    const mid = (start + end) / 2;
    if (nowAbs >= start - JENDELA_MENIT && nowAbs < mid) {
      kandidat.push({ tanggal: d, shift: kode, jenis: "Masuk", event: start, jarak: Math.abs(nowAbs - start) });
    } else if (nowAbs >= mid && nowAbs <= end + JENDELA_MENIT) {
      kandidat.push({ tanggal: d, shift: kode, jenis: "Pulang", event: end, jarak: Math.abs(nowAbs - end) });
    }
  });
  if (!kandidat.length) return null;
  kandidat.sort(function (a, b) { return a.jarak - b.jarak || (a.jenis === "Pulang" ? -1 : 1); });
  const k = kandidat[0];
  const def = SHIFT_DEF[k.shift];
  if (k.jenis === "Masuk") {
    const telat = nowAbs - menitAbsolut(k.tanggal, def.mulai);
    k.statusWaktu = telat <= set.tolTelat ? "Tepat Waktu" : "Terlambat " + telat + " menit";
  } else {
    const cepat = menitAbsolut(k.tanggal, def.selesai) - nowAbs;
    k.statusWaktu = cepat <= set.tolCepat ? "Tepat Waktu" : "Pulang Cepat " + cepat + " menit";
  }
  return k;
}

/* ---------- Jadwal Juli 2026 (seed dari PDF) ---------- */
const SEED = {
  P1: ["I","I","I","-","-","I","I","I","I","I","-","-","I","I","I","I","I","-","-","I","I","I","I","I","-","-","I","I","I","I","I"],
  P2: ["-","III","II","-","IV","II","-","III","II","-","IV","V","-","III","II","-","III","V","-","III","II","-","III","II","-","IV","II","-","III","II","-"],
  P3: ["II","-","III","V","-","III","II","-","III","II","-","IV","II","-","III","II","-","IV","V","-","III","II","-","III","V","-","III","II","-","III","II"],
  P4: ["III","II","-","IV","V","-","III","II","-","III","V","-","III","II","-","III","II","-","IV","II","-","III","II","-","IV","V","-","III","II","-","III"]
};
const jadwal = {};
Object.keys(SEED).forEach(function (id) {
  jadwal[id] = {};
  SEED[id].forEach(function (kode, i) { jadwal[id]["2026-07-" + pad2(i + 1)] = kode; });
});

const set = { tolTelat: 10, tolCepat: 5 };
let lulus = 0, gagal = 0;
function uji(nama, hasil, harap) {
  const h = hasil ? (hasil.jenis + "|" + hasil.tanggal + "|" + hasil.shift + "|" + hasil.statusWaktu) : "null";
  if (h === harap) { lulus++; console.log("  OK  " + nama); }
  else { gagal++; console.log("GAGAL " + nama + "\n      dapat : " + h + "\n      harap : " + harap); }
}

console.log("== Shift I (Klemens, 08.00-16.00) ==");
uji("masuk 07.55 tgl 1 → Masuk tepat waktu",
  tentukanAbsen(jadwal, "P1", "2026-07-01", 475, set), "Masuk|2026-07-01|I|Tepat Waktu");
uji("masuk 08.25 tgl 1 → Terlambat 25 menit",
  tentukanAbsen(jadwal, "P1", "2026-07-01", 505, set), "Masuk|2026-07-01|I|Terlambat 25 menit");
uji("pulang 16.05 tgl 1 → Pulang tepat waktu",
  tentukanAbsen(jadwal, "P1", "2026-07-01", 965, set), "Pulang|2026-07-01|I|Tepat Waktu");
uji("pulang 15.00 tgl 1 → Pulang Cepat 60 menit",
  tentukanAbsen(jadwal, "P1", "2026-07-01", 900, set), "Pulang|2026-07-01|I|Pulang Cepat 60 menit");
uji("sabtu tgl 4 (off) jam 08.00 → ditolak (null)",
  tentukanAbsen(jadwal, "P1", "2026-07-04", 480, set), "null");

console.log("== Shift II (16.00-24.00): pulang lintas tengah malam ==");
// Naftali tgl 1 shift II; pulang 00.10 tgl 2 → tanggal dinas tetap 1 Juli
uji("pulang 00.10 tgl 2 → Pulang II tanggal dinas tgl 1, tepat waktu",
  tentukanAbsen(jadwal, "P3", "2026-07-02", 10, set), "Pulang|2026-07-01|II|Tepat Waktu");
uji("pulang 23.30 tgl 1 → Pulang Cepat 30 menit",
  tentukanAbsen(jadwal, "P3", "2026-07-01", 1410, set), "Pulang|2026-07-01|II|Pulang Cepat 30 menit");
uji("masuk 15.40 tgl 1 → Masuk II tepat waktu",
  tentukanAbsen(jadwal, "P3", "2026-07-01", 940, set), "Masuk|2026-07-01|II|Tepat Waktu");

console.log("== Shift III (00.00-08.00): masuk sebelum tengah malam ==");
// Agustinus tgl 1 shift III; datang 23.45 tgl 30 Juni → Masuk tanggal dinas 1 Juli
uji("masuk 23.45 (30 Jun) → Masuk III tanggal dinas 1 Jul, tepat waktu",
  tentukanAbsen(jadwal, "P4", "2026-06-30", 1425, set), "Masuk|2026-07-01|III|Tepat Waktu");
uji("masuk 00.20 tgl 1 → Terlambat 20 menit",
  tentukanAbsen(jadwal, "P4", "2026-07-01", 20, set), "Masuk|2026-07-01|III|Terlambat 20 menit");
uji("pulang 08.02 tgl 1 → Pulang III tepat waktu",
  tentukanAbsen(jadwal, "P4", "2026-07-01", 482, set), "Pulang|2026-07-01|III|Tepat Waktu");

console.log("== Shift IV & V 12 jam (hari off rekan) ==");
// Merin tgl 5 shift IV (00-12); Agustinus tgl 5 shift V (12-24)
uji("Merin masuk 00.05 tgl 5 → Masuk IV Tepat Waktu (tol 10)",
  tentukanAbsen(jadwal, "P2", "2026-07-05", 5, set), "Masuk|2026-07-05|IV|Tepat Waktu");
uji("Merin pulang 12.01 tgl 5 → Pulang IV tepat waktu",
  tentukanAbsen(jadwal, "P2", "2026-07-05", 721, set), "Pulang|2026-07-05|IV|Tepat Waktu");
uji("Agustinus masuk 11.50 tgl 5 → Masuk V tepat waktu",
  tentukanAbsen(jadwal, "P4", "2026-07-05", 710, set), "Masuk|2026-07-05|V|Tepat Waktu");
uji("Agustinus pulang 00.15 tgl 6 → Pulang V tanggal dinas tgl 5",
  tentukanAbsen(jadwal, "P4", "2026-07-06", 15, set), "Pulang|2026-07-05|V|Tepat Waktu");

console.log("== Batas serah terima 16.00 ==");
// Tgl 6: Merin II (16-24), Naftali III (00-08)... cek tgl 6: P2=II, P3=III, P4=-. Klemens I.
uji("16.00 tgl 6: Klemens → Pulang I (bukan Masuk II orang lain)",
  tentukanAbsen(jadwal, "P1", "2026-07-06", 960, set), "Pulang|2026-07-06|I|Tepat Waktu");
uji("16.00 tgl 6: Merin → Masuk II",
  tentukanAbsen(jadwal, "P2", "2026-07-06", 960, set), "Masuk|2026-07-06|II|Tepat Waktu");

console.log("== Jendela absen ==");
uji("absen jam 12.00 saat shift II (16-24) belum waktunya → null (di luar jendela masuk 4 jam)",
  tentukanAbsen(jadwal, "P2", "2026-07-06", 715, set), "null");
uji("absen 12.10 utk shift II → sudah masuk jendela (16.00-4j=12.00) → Masuk",
  tentukanAbsen(jadwal, "P2", "2026-07-06", 730, set), "Masuk|2026-07-06|II|Tepat Waktu");

console.log("== Hari terakhir bulan & lintas bulan ==");
// P3 tgl 31 shift II → pulang 00.05 tgl 1 Agustus (jadwal Agustus kosong)
uji("pulang 00.05 (1 Agu) utk shift II tgl 31 Jul",
  tentukanAbsen(jadwal, "P3", "2026-08-01", 5, set), "Pulang|2026-07-31|II|Tepat Waktu");

console.log("\nHasil: " + lulus + " lulus, " + gagal + " gagal");
process.exit(gagal ? 1 : 0);
