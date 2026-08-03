/* ============================================================
   BACKEND ABSEN SATPAM (PIKET POS) — Google Apps Script
   Politeknik KP Sorong
   ------------------------------------------------------------
   Perbedaan utama dgn Absensi PJLP:
   - Jadwal SHIFT per-orang per-tanggal (sheet "Jadwal"),
     bukan jam kerja global.
   - Shift: I (08-16), II (16-24), III (00-08), IV (00-12),
     V (12-24), "-" = Off.
   - "Tanggal Dinas" dibedakan dari tanggal kalender: absen
     pulang shift II jam 00.05 tetap milik tanggal dinas kemarin.
   - Absen WAJIB selfie (anti titip absen) + geofence pos jaga.
   - Tukar/ganti piket dicatat admin (sheet "TukarPiket") dan
     otomatis dipakai saat validasi & rekap.
   ------------------------------------------------------------
   PASANG:
   1. Buka Google Sheet baru > Ekstensi > Apps Script, tempel file ini.
   2. Jalankan fungsi  setup  sekali (izinkan akses).
      -> membuat semua tab + seed personel & jadwal Juli 2026.
      -> password admin awal: admin123 (lihat View > Logs).
   3. Deploy > New deployment > Web app
      (Execute as: Me, Who has access: Anyone) > salin URL /exec.
   Ubah kode -> Deploy > Manage deployments > Edit > New version.
   ============================================================ */

const TZ = "GMT+9"; // WIT

const SHEET_ABSEN = "Absensi";
const SHEET_PATROLI = "JurnalPatroli";
const SHEET_IZIN = "Ketidakhadiran";
const SHEET_PERANGKAT = "Perangkat";
const SHEET_PERSONEL = "Personel";
const SHEET_JADWAL = "Jadwal";
const SHEET_TUKAR = "TukarPiket";
const SHEET_OPERATOR = "Operator";
const FOLDER_NAME = "Foto Absen Satpam";

const JENIS_IZIN = ["Izin", "Sakit", "Cuti", "Dinas Luar", "Lainnya"];

/* Definisi shift (menit sejak 00.00 pada TANGGAL DINAS).
   selesai boleh 1440 (= 24.00, jatuh di tanggal kalender berikutnya). */
const SHIFT_DEF = {
  "I":   { mulai: 480,  selesai: 960,  label: "08.00-16.00" },
  "II":  { mulai: 960,  selesai: 1440, label: "16.00-24.00" },
  "III": { mulai: 0,    selesai: 480,  label: "00.00-08.00" },
  "IV":  { mulai: 0,    selesai: 720,  label: "00.00-12.00" },
  "V":   { mulai: 720,  selesai: 1440, label: "12.00-24.00" }
};
const KODE_SHIFT_VALID = ["I", "II", "III", "IV", "V", "-"];
/* Jendela absen: berapa menit sebelum mulai / sesudah selesai shift
   absen masih diterima dan dikaitkan ke shift tsb. */
const JENDELA_MENIT = 240;

const HEADER_ABSEN = [
  "Timestamp", "Device ID", "ID Personel", "Nama", "Tanggal Dinas", "Shift",
  "Jenis", "Status Waktu", "Tanggal", "Jam", "Foto Selfie",
  "Latitude", "Longitude", "Akurasi (m)", "Jarak (m)", "Link Lokasi", "Keterangan"
];
const HEADER_PATROLI = [
  "Timestamp", "Device ID", "ID Personel", "Nama", "Tanggal", "Jam",
  "Kegiatan", "Foto", "Latitude", "Longitude", "Link Lokasi"
];
const HEADER_IZIN = [
  "Timestamp", "Device ID", "ID Personel", "Nama", "Jenis",
  "Tanggal Mulai", "Tanggal Selesai", "Alasan", "Foto Surat"
];
const HEADER_PERANGKAT = [
  "Device ID", "ID Personel", "Nama", "Status", "Didaftarkan", "Diperbarui"
];
const HEADER_PERSONEL = ["ID Personel", "Nama", "Jabatan", "Aktif"];
const HEADER_JADWAL = ["Bulan", "ID Personel", "Nama"]
  .concat(Array.apply(null, { length: 31 }).map(function (_, i) { return String(i + 1); }));
const HEADER_TUKAR = [
  "Timestamp", "Tanggal", "Shift", "ID Asal", "Nama Asal",
  "ID Pengganti", "Nama Pengganti", "Alasan"
];
/* Operator = akun admin tambahan (login penuh seperti admin, tetapi hanya
   admin utama yang boleh menambah/menghapus operator & mengubah akun utama). */
const HEADER_OPERATOR = ["Email", "Password", "Nama", "Aktif"];
const SEED_OPERATOR = [
  ["skprahim05@gmail.com", "operator123", "Operator", "ya"]
];

/* ---------- Seed personel & jadwal Juli 2026 (dari Jadwal Piket Pos) ---------- */
const SEED_PERSONEL = [
  ["P1", "Klemens M. Burdam", "Koordinator K5", "ya"],
  ["P2", "Muhamad Merin", "Anggota", "ya"],
  ["P3", "Naftali Mandibo", "Anggota", "ya"],
  ["P4", "Agustinus Lado", "Anggota", "ya"]
];
const SEED_JADWAL_BULAN = "2026-07";
const SEED_JADWAL = {
  "P1": ["I","I","I","-","-","I","I","I","I","I","-","-","I","I","I","I","I","-","-","I","I","I","I","I","-","-","I","I","I","I","I"],
  "P2": ["-","III","II","-","IV","II","-","III","II","-","IV","V","-","III","II","-","III","V","-","III","II","-","III","II","-","IV","II","-","III","II","-"],
  "P3": ["II","-","III","V","-","III","II","-","III","II","-","IV","II","-","III","II","-","IV","V","-","III","II","-","III","V","-","III","II","-","III","II"],
  "P4": ["III","II","-","IV","V","-","III","II","-","III","V","-","III","II","-","III","II","-","IV","II","-","III","II","-","IV","V","-","III","II","-","III"]
};

const DEFAULT_TOL_TELAT = 10;  // menit toleransi terlambat masuk
const DEFAULT_TOL_CEPAT = 5;   // menit toleransi pulang lebih awal

/* ====================== SETUP ============================== */
function setup() {
  getSheetAbsen(); getSheetPatroli(); getSheetIzin();
  getSheetPerangkat(); getSheetPersonel(); getSheetJadwal(); getSheetTukar(); getSheetOperator();
  perbaikiHeader();
  seedDataAwal();
  const p = props();
  if (!p.getProperty("ADMIN_EMAIL")) p.setProperty("ADMIN_EMAIL", "dausdaba@polikpsorong.ac.id");
  if (!p.getProperty("ADMIN_PASSWORD")) p.setProperty("ADMIN_PASSWORD", "admin123");
  if (!p.getProperty("TOL_TELAT")) p.setProperty("TOL_TELAT", String(DEFAULT_TOL_TELAT));
  if (!p.getProperty("TOL_CEPAT")) p.setProperty("TOL_CEPAT", String(DEFAULT_TOL_CEPAT));
  if (!p.getProperty("ABAIKAN_LOKASI")) p.setProperty("ABAIKAN_LOKASI", "true"); // mode uji coba awal
  if (!p.getProperty("NAMA_INSTANSI")) p.setProperty("NAMA_INSTANSI", "Politeknik Kelautan dan Perikanan Sorong");
  if (!p.getProperty("NAMA_KOORDINATOR")) p.setProperty("NAMA_KOORDINATOR", "Klemens M. Burdam");
  if (!p.getProperty("NAMA_PENGESAH")) p.setProperty("NAMA_PENGESAH", "Abdullah Sidiq, A.Md.,S.Pi.,M.Pi");
  if (!p.getProperty("JABATAN_PENGESAH")) p.setProperty("JABATAN_PENGESAH", "Kasub Bagian Umum");
  Logger.log("Setup selesai. Password admin awal: " + p.getProperty("ADMIN_PASSWORD"));
  Logger.log("GANTI password ini lewat panel admin setelah login pertama.");
}

/* ====================== ROUTING =========================== */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    switch (data.action) {
      case "listPersonel":       return listPersonelPublik();
      case "daftarPerangkat":    return daftarPerangkat(data);
      case "cekPerangkat":       return cekPerangkat(data);
      case "jadwalSaya":         return jadwalSaya(data);
      case "absen":              return absen(data);
      case "patroli":            return patroli(data);
      case "izin":               return izin(data);
      case "rekapAbsensi":       return rekapData(data, SHEET_ABSEN, HEADER_ABSEN);
      case "rekapPatroli":       return rekapData(data, SHEET_PATROLI, HEADER_PATROLI);
      case "rekapIzin":          return rekapData(data, SHEET_IZIN, HEADER_IZIN);
      case "adminLogin":         return adminLogin(data);
      case "adminData":          return adminData(data);
      case "setStatusPerangkat": return setStatusPerangkat(data);
      case "hapusPerangkat":     return hapusPerangkat(data);
      case "adminJadwal":        return adminJadwal(data);
      case "simpanJadwal":       return simpanJadwal(data);
      case "adminTukar":         return adminTukar(data);
      case "simpanTukar":        return simpanTukar(data);
      case "hapusTukar":         return hapusTukar(data);
      case "simpanPersonel":     return simpanPersonel(data);
      case "dataLaporan":        return dataLaporan(data);
      case "simpanPengaturan":   return simpanPengaturan(data);
      case "simpanOperator":     return simpanOperator(data);
      case "hapusOperator":      return hapusOperator(data);
      default:
        return jsonOutput({ status: "error", message: "Aksi tidak dikenal: " + data.action });
    }
  } catch (err) {
    return jsonOutput({ status: "error", message: String(err && err.message ? err.message : err) });
  }
}

function doGet() { return jsonOutput({ status: "success", message: "API Absen Satpam aktif." }); }

/* ====================== PERSONEL ========================= */
function getPersonel() {
  const values = getSheetPersonel().getDataRange().getValues();
  values.shift();
  return values.map(function (r, i) {
    return { rowIndex: i + 2, id: String(r[0]).trim(), nama: String(r[1] || "").trim(), jabatan: r[2] || "", aktif: String(r[3] || "ya") === "ya" };
  }).filter(function (x) { return x.id; });
}
function cariPersonel(id) {
  return getPersonel().filter(function (x) { return x.id === String(id).trim(); })[0] || null;
}
function listPersonelPublik() {
  // Untuk dropdown pendaftaran perangkat: hanya id + nama + jabatan.
  const out = getPersonel().filter(function (x) { return x.aktif; })
    .map(function (x) { return { id: x.id, nama: x.nama, jabatan: x.jabatan }; });
  return jsonOutput({ status: "success", personel: out });
}
function simpanPersonel(data) {
  if (!cekAdmin(data)) return jsonOutput({ status: "error", message: "Email atau password admin salah." });
  const id = String(data.id || "").trim();
  const nama = String(data.nama || "").trim();
  if (!id || !nama) return jsonOutput({ status: "error", message: "ID & nama personel wajib diisi." });
  const sheet = getSheetPersonel();
  const existing = cariPersonel(id);
  const row = [id, nama, data.jabatan || "Anggota", data.aktif === false ? "tidak" : "ya"];
  if (existing) sheet.getRange(existing.rowIndex, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  return jsonOutput({ status: "success", message: "Data personel tersimpan." });
}

/* ====================== PERANGKAT ======================== */
function daftarPerangkat(data) {
  if (!data.deviceId) return jsonOutput({ status: "error", message: "ID perangkat wajib." });
  const per = cariPersonel(data.personelId || "");
  if (!per || !per.aktif) return jsonOutput({ status: "error", message: "Pilih nama personel yang valid." });
  const ada = cariPerangkat(data.deviceId);
  if (ada) return jsonOutput({ status: "success", deviceStatus: ada.status, message: "Perangkat sudah terdaftar (" + ada.status + ")." });
  const now = new Date();
  getSheetPerangkat().appendRow([String(data.deviceId), per.id, per.nama, "pending", now, now]);
  return jsonOutput({ status: "success", deviceStatus: "pending", message: "Pendaftaran terkirim. Menunggu persetujuan admin." });
}

function cekPerangkat(data) {
  const dev = cariPerangkat(data.deviceId);
  if (!dev) return jsonOutput({ status: "success", terdaftar: false });
  return jsonOutput({ status: "success", terdaftar: true, deviceStatus: dev.status, personelId: dev.personelId, nama: dev.nama });
}

function getDataPerangkat() {
  const values = getSheetPerangkat().getDataRange().getValues();
  values.shift();
  return values.map(function (r, i) {
    return { rowIndex: i + 2, deviceId: String(r[0]), personelId: String(r[1] || ""), nama: r[2], status: r[3], didaftarkan: r[4] };
  });
}
function cariPerangkat(deviceId) {
  if (!deviceId) return null;
  return getDataPerangkat().filter(function (d) { return d.deviceId === String(deviceId); })[0] || null;
}
function setStatusPerangkat(data) {
  if (!cekAdmin(data)) return jsonOutput({ status: "error", message: "Email atau password admin salah." });
  if (["pending", "disetujui", "diblokir"].indexOf(data.statusBaru) === -1) return jsonOutput({ status: "error", message: "Status tidak valid." });
  const dev = cariPerangkat(data.deviceId);
  if (!dev) return jsonOutput({ status: "error", message: "Perangkat tidak ditemukan." });
  getSheetPerangkat().getRange(dev.rowIndex, 4).setValue(data.statusBaru);
  getSheetPerangkat().getRange(dev.rowIndex, 6).setValue(new Date());
  return jsonOutput({ status: "success", message: "Status diperbarui." });
}
function hapusPerangkat(data) {
  if (!cekAdmin(data)) return jsonOutput({ status: "error", message: "Email atau password admin salah." });
  const dev = cariPerangkat(data.deviceId);
  if (!dev) return jsonOutput({ status: "error", message: "Perangkat tidak ditemukan." });
  getSheetPerangkat().deleteRow(dev.rowIndex);
  return jsonOutput({ status: "success", message: "Perangkat dihapus." });
}

/* ====================== KALENDER / WAKTU ==================
   Semua hitungan waktu memakai pasangan (ymd, menit) dalam zona
   WIT, dikonversi ke "menit absolut" via nomor hari — bebas dari
   kerumitan zona waktu server. */
function ymdKeDayNum(ymd) {
  const p = ymd.split("-").map(Number);
  return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
}
function tambahHari(ymd, n) {
  const p = ymd.split("-").map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}
function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function menitAbsolut(ymd, menit) { return ymdKeDayNum(ymd) * 1440 + menit; }
function menitKeJam(m) {
  m = ((m % 1440) + 1440) % 1440;
  return pad2(Math.floor(m / 60)) + "." + pad2(m % 60);
}

/* ====================== JADWAL =========================== */
/* Normalisasi nilai kolom "Bulan": Google Sheets sering meng-otomatis-ubah
   teks "2026-07" menjadi Date. Kembalikan selalu "YYYY-MM". */
function bulanSel(v) {
  if (v instanceof Date) return fmt(v, "yyyy-MM");
  return String(v == null ? "" : v).trim().substring(0, 7);
}
function getJadwalBulan(bulan) {
  // -> { "P1": {nama, shifts: [31 x kode]} , ... }
  const values = getSheetJadwal().getDataRange().getValues();
  values.shift();
  const out = {};
  values.forEach(function (r) {
    if (bulanSel(r[0]) !== bulan) return;
    const id = String(r[1]).trim();
    if (!id) return;
    const shifts = [];
    for (var i = 0; i < 31; i++) {
      var v = String(r[3 + i] == null ? "" : r[3 + i]).trim().toUpperCase();
      shifts.push(SHIFT_DEF[v] ? v : "-");
    }
    out[id] = { nama: r[2] || "", shifts: shifts };
  });
  return out;
}

function getTukarSemua() {
  const values = getSheetTukar().getDataRange().getValues();
  values.shift();
  return values.map(function (r, i) {
    return {
      rowIndex: i + 2,
      timestamp: r[0] instanceof Date ? fmt(r[0], "yyyy-MM-dd HH:mm") : String(r[0] || ""),
      tanggal: r[1] instanceof Date ? fmt(r[1], "yyyy-MM-dd") : String(r[1] || "").substring(0, 10),
      shift: String(r[2] || "").trim().toUpperCase(),
      idAsal: String(r[3] || "").trim(), namaAsal: r[4] || "",
      idPengganti: String(r[5] || "").trim(), namaPengganti: r[6] || "",
      alasan: r[7] || ""
    };
  });
}

/* Shift efektif seseorang pada satu tanggal dinas:
   jadwal grid + koreksi TukarPiket (pengalihan). */
function shiftEfektif(personelId, ymd, cacheJadwal, cacheTukar) {
  const bulan = ymd.substring(0, 7);
  if (!cacheJadwal[bulan]) cacheJadwal[bulan] = getJadwalBulan(bulan);
  const jdw = cacheJadwal[bulan];
  const hariIdx = parseInt(ymd.substring(8, 10), 10) - 1;
  let kode = (jdw[personelId] && jdw[personelId].shifts[hariIdx]) || "-";
  const tukar = cacheTukar.length ? cacheTukar : [];
  tukar.forEach(function (t) {
    if (t.tanggal !== ymd) return;
    if (t.idAsal === personelId) kode = "-";           // shiftnya dialihkan ke orang lain
  });
  tukar.forEach(function (t) {
    if (t.tanggal !== ymd) return;
    if (t.idPengganti === personelId && SHIFT_DEF[t.shift]) kode = t.shift; // menerima pengalihan
  });
  return kode;
}

/* Tentukan (tanggal dinas, shift, jenis) untuk sebuah absen "sekarang".
   Kandidat tanggal dinas: kemarin, hari ini, besok — karena:
   - pulang shift II/IV/V jam 24.00 jatuh di tanggal kalender berikutnya;
   - masuk shift III/IV (mulai 00.00) bisa dilakukan sebelum tengah malam. */
function tentukanAbsen(personelId, now, set) {
  const nowYmd = fmt(now, "yyyy-MM-dd");
  const nowMin = parseInt(fmt(now, "H"), 10) * 60 + parseInt(fmt(now, "m"), 10);
  const nowAbs = menitAbsolut(nowYmd, nowMin);
  const cacheJadwal = {}, cacheTukar = getTukarSemua();
  const kandidat = [];
  [-1, 0, 1].forEach(function (n) {
    const d = tambahHari(nowYmd, n);
    const kode = shiftEfektif(personelId, d, cacheJadwal, cacheTukar);
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
  // Terdekat menang; jika seri (mis. 00.00 tepat), dahulukan Pulang shift sebelumnya.
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

/* ====================== ABSEN ============================ */
function absen(data) {
  const dev = cariPerangkat(data.deviceId);
  if (!dev) return jsonOutput({ status: "error", code: "belum_daftar", message: "Perangkat belum terdaftar." });
  if (dev.status !== "disetujui") return jsonOutput({ status: "error", code: dev.status, message: "Perangkat berstatus '" + dev.status + "'. Hubungi admin." });
  if (!data.foto) return jsonOutput({ status: "error", message: "Foto selfie wajib diambil saat absen." });

  const set = getPengaturan();
  const now = new Date();

  let jarak = "";
  if (!set.abaikanLokasi) {
    if (isNaN(set.lat) || isNaN(set.lng) || !set.radius) return jsonOutput({ status: "error", message: "Lokasi pos jaga belum diatur oleh admin." });
    if (!data.lat || !data.lng) return jsonOutput({ status: "error", message: "Lokasi GPS wajib diambil." });
    jarak = haversine(data.lat, data.lng, set.lat, set.lng);
    if (jarak > set.radius) return jsonOutput({ status: "error", message: "Absen ditolak: Anda di luar area pos jaga (±" + Math.round(jarak) + " m, maksimal " + set.radius + " m)." });
  } else if (data.lat && data.lng && !isNaN(set.lat) && !isNaN(set.lng)) {
    jarak = haversine(data.lat, data.lng, set.lat, set.lng);
  }

  const hasil = tentukanAbsen(dev.personelId, now, set);
  if (!hasil) {
    return jsonOutput({
      status: "error",
      message: "Tidak ada jadwal piket Anda di sekitar waktu ini. Periksa jadwal, atau hubungi koordinator bila ada tukar piket yang belum dicatat."
    });
  }

  // Cegah absen ganda utk (personel, tanggal dinas, jenis) yang sama.
  const sudah = adaAbsen(dev.personelId, hasil.tanggal, hasil.jenis);
  if (sudah) return jsonOutput({ status: "error", message: "Anda sudah absen " + hasil.jenis + " untuk piket " + hasil.tanggal + " (shift " + hasil.shift + ") pukul " + sudah + "." });

  const fotoUrl = simpanFoto(data.foto, dev.nama, "absen", now);
  const linkLok = (data.lat && data.lng) ? "https://maps.google.com/?q=" + data.lat + "," + data.lng : "";
  getSheetAbsen().appendRow([
    now, dev.deviceId, dev.personelId, dev.nama, hasil.tanggal, hasil.shift,
    hasil.jenis, hasil.statusWaktu, fmt(now, "yyyy-MM-dd"), fmt(now, "HH:mm:ss"),
    fotoUrl, data.lat || "", data.lng || "", data.akurasi || "",
    jarak === "" ? "" : Math.round(jarak), linkLok, data.keterangan || ""
  ]);
  const infoJarak = jarak === "" ? "" : ", ±" + Math.round(jarak) + " m dari pos";
  return jsonOutput({
    status: "success",
    message: "Absen " + hasil.jenis + " shift " + hasil.shift + " (" + SHIFT_DEF[hasil.shift].label + ") piket " + hasil.tanggal + " berhasil — " + hasil.statusWaktu + infoJarak + "."
  });
}

function adaAbsen(personelId, tanggalDinas, jenis) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ABSEN);
  if (!sheet) return null;
  const values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    const r = values[i];
    const tgl = r[4] instanceof Date ? fmt(r[4], "yyyy-MM-dd") : String(r[4] || "").substring(0, 10);
    if (String(r[2]) === String(personelId) && tgl === tanggalDinas && String(r[6]) === jenis) {
      return r[9] instanceof Date ? fmt(r[9], "HH:mm") : String(r[9] || "");
    }
  }
  return null;
}

/* ====================== JADWAL SAYA ====================== */
function jadwalSaya(data) {
  const dev = cariPerangkat(data.deviceId);
  if (!dev) return jsonOutput({ status: "error", code: "belum_daftar", message: "Perangkat belum terdaftar." });
  if (dev.status !== "disetujui") return jsonOutput({ status: "error", code: dev.status, message: "Perangkat berstatus '" + dev.status + "'." });
  const now = new Date();
  const bulan = (data.bulan && /^\d{4}-\d{2}$/.test(data.bulan)) ? data.bulan : fmt(now, "yyyy-MM");
  const jdw = getJadwalBulan(bulan);
  const cacheJadwal = {}; cacheJadwal[bulan] = jdw;
  const tukar = getTukarSemua();
  const hariIni = fmt(now, "yyyy-MM-dd");
  const besok = tambahHari(hariIni, 1);
  const baris = jdw[dev.personelId] ? jdw[dev.personelId].shifts : null;
  // Terapkan koreksi tukar piket ke tampilan grid bulan tsb.
  let shifts = null;
  if (baris) {
    shifts = baris.slice();
    tukar.forEach(function (t) {
      if (t.tanggal.substring(0, 7) !== bulan) return;
      const idx = parseInt(t.tanggal.substring(8, 10), 10) - 1;
      if (t.idAsal === dev.personelId) shifts[idx] = "-";
      if (t.idPengganti === dev.personelId && SHIFT_DEF[t.shift]) shifts[idx] = t.shift;
    });
  }
  return jsonOutput({
    status: "success", bulan: bulan, nama: dev.nama, personelId: dev.personelId,
    shifts: shifts, shiftDef: labelShiftDef(),
    hariIni: { tanggal: hariIni, shift: shiftEfektif(dev.personelId, hariIni, cacheJadwal, tukar) },
    besok: { tanggal: besok, shift: shiftEfektif(dev.personelId, besok, cacheJadwal, tukar) }
  });
}
function labelShiftDef() {
  const out = {};
  Object.keys(SHIFT_DEF).forEach(function (k) { out[k] = SHIFT_DEF[k].label; });
  return out;
}

/* ====================== PATROLI & IZIN =================== */
function patroli(data) {
  const dev = cariPerangkat(data.deviceId);
  if (!dev) return jsonOutput({ status: "error", code: "belum_daftar", message: "Perangkat belum terdaftar." });
  if (dev.status !== "disetujui") return jsonOutput({ status: "error", code: dev.status, message: "Perangkat berstatus '" + dev.status + "'. Hubungi admin." });
  if (!data.kegiatan || !String(data.kegiatan).trim()) return jsonOutput({ status: "error", message: "Deskripsi patroli/kejadian wajib diisi." });
  if (!data.foto) return jsonOutput({ status: "error", message: "Foto wajib diambil." });
  const now = new Date();
  const fotoUrl = simpanFoto(data.foto, dev.nama, "patroli", now);
  const linkLok = (data.lat && data.lng) ? "https://maps.google.com/?q=" + data.lat + "," + data.lng : "";
  getSheetPatroli().appendRow([
    now, dev.deviceId, dev.personelId, dev.nama, fmt(now, "yyyy-MM-dd"), fmt(now, "HH:mm:ss"),
    String(data.kegiatan).trim(), fotoUrl, data.lat || "", data.lng || "", linkLok
  ]);
  return jsonOutput({ status: "success", message: "Jurnal patroli berhasil disimpan." });
}

function izin(data) {
  const dev = cariPerangkat(data.deviceId);
  if (!dev) return jsonOutput({ status: "error", code: "belum_daftar", message: "Perangkat belum terdaftar." });
  if (dev.status !== "disetujui") return jsonOutput({ status: "error", code: dev.status, message: "Perangkat berstatus '" + dev.status + "'. Hubungi admin." });
  if (JENIS_IZIN.indexOf(data.jenis) === -1) return jsonOutput({ status: "error", message: "Jenis ketidakhadiran tidak valid." });
  if (!data.tglMulai) return jsonOutput({ status: "error", message: "Tanggal mulai wajib diisi." });
  if (!data.alasan || !String(data.alasan).trim()) return jsonOutput({ status: "error", message: "Alasan wajib diisi." });
  if (!data.foto) return jsonOutput({ status: "error", message: "Foto surat wajib dilampirkan." });
  const now = new Date();
  const fotoUrl = simpanFoto(data.foto, dev.nama, "surat", now);
  getSheetIzin().appendRow([
    now, dev.deviceId, dev.personelId, dev.nama, data.jenis,
    data.tglMulai, data.tglSelesai || data.tglMulai, String(data.alasan).trim(), fotoUrl
  ]);
  return jsonOutput({ status: "success", message: "Pengajuan " + data.jenis + " berhasil dikirim." });
}

/* ====================== REKAP =========================== */
function rekapData(data, namaSheet, header) {
  const isAdmin = passwordAdminAtauOperator(data.adminPassword);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(namaSheet);
  if (!sheet) return jsonOutput({ status: "success", data: [], isAdmin: !!isAdmin });
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return jsonOutput({ status: "success", data: [], isAdmin: !!isAdmin });
  values.shift();
  const idxId = header.indexOf("ID Personel");
  let rows;
  if (isAdmin) {
    rows = values;
  } else {
    const devSaya = cariPerangkat(data.deviceId);
    const idSaya = devSaya ? String(devSaya.personelId) : "";
    rows = values.filter(function (r) { return idSaya && String(r[idxId]) === idSaya; });
  }
  const out = rows.map(function (row) {
    const obj = {};
    header.forEach(function (h, i) {
      let v = row[i];
      if (v instanceof Date) {
        v = (h === "Tanggal" || h === "Tanggal Dinas" || h === "Tanggal Mulai" || h === "Tanggal Selesai") ? fmt(v, "yyyy-MM-dd")
          : (h === "Jam") ? fmt(v, "HH:mm:ss") : fmt(v, "yyyy-MM-dd HH:mm:ss");
      }
      obj[h] = v;
    });
    return obj;
  });
  return jsonOutput({ status: "success", data: out, isAdmin: !!isAdmin });
}

/* ====================== ADMIN =========================== */
function adminLogin(data) {
  if (!cekAdmin(data)) return jsonOutput({ status: "error", message: "Email atau password admin salah." });
  return jsonOutput({ status: "success", message: "Login berhasil." });
}

function adminData(data) {
  if (!cekAdmin(data)) return jsonOutput({ status: "error", message: "Email atau password admin salah." });
  return jsonOutput({
    status: "success",
    perangkat: getDataPerangkat().map(function (d) {
      return { deviceId: d.deviceId, personelId: d.personelId, nama: d.nama, status: d.status, didaftarkan: d.didaftarkan instanceof Date ? fmt(d.didaftarkan, "yyyy-MM-dd HH:mm") : d.didaftarkan };
    }),
    personel: getPersonel().map(function (x) { return { id: x.id, nama: x.nama, jabatan: x.jabatan, aktif: x.aktif }; }),
    pengaturan: getPengaturanPublic(),
    isPrimary: isPrimaryAdmin(data),
    operator: getOperator().map(function (o) { return { email: o.email, nama: o.nama, aktif: o.aktif }; })
  });
}

function adminJadwal(data) {
  if (!cekAdmin(data)) return jsonOutput({ status: "error", message: "Email atau password admin salah." });
  const bulan = data.bulan;
  if (!/^\d{4}-\d{2}$/.test(bulan || "")) return jsonOutput({ status: "error", message: "Format bulan harus YYYY-MM." });
  const jdw = getJadwalBulan(bulan);
  const baris = getPersonel().filter(function (x) { return x.aktif; }).map(function (x) {
    return { id: x.id, nama: x.nama, jabatan: x.jabatan, shifts: jdw[x.id] ? jdw[x.id].shifts : Array.apply(null, { length: 31 }).map(function () { return "-"; }) };
  });
  return jsonOutput({ status: "success", bulan: bulan, baris: baris, shiftDef: labelShiftDef() });
}

function simpanJadwal(data) {
  if (!cekAdmin(data)) return jsonOutput({ status: "error", message: "Email atau password admin salah." });
  const bulan = data.bulan;
  if (!/^\d{4}-\d{2}$/.test(bulan || "")) return jsonOutput({ status: "error", message: "Format bulan harus YYYY-MM." });
  if (!data.baris || !data.baris.length) return jsonOutput({ status: "error", message: "Tidak ada baris jadwal." });
  const sheet = getSheetJadwal();
  // Hapus baris bulan tsb (dari bawah agar index tidak bergeser), lalu tulis ulang.
  const values = sheet.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (bulanSel(values[i][0]) === bulan) sheet.deleteRow(i + 1);
  }
  data.baris.forEach(function (b) {
    const per = cariPersonel(b.id);
    if (!per) return;
    const shifts = [];
    for (var j = 0; j < 31; j++) {
      var v = String((b.shifts && b.shifts[j]) || "-").trim().toUpperCase();
      shifts.push(KODE_SHIFT_VALID.indexOf(v) !== -1 ? v : "-");
    }
    sheet.appendRow([bulan, per.id, per.nama].concat(shifts));
  });
  return jsonOutput({ status: "success", message: "Jadwal " + bulan + " tersimpan." });
}

/* ---------- Tukar / ganti piket (dicatat admin) ---------- */
function adminTukar(data) {
  if (!cekAdmin(data)) return jsonOutput({ status: "error", message: "Email atau password admin salah." });
  return jsonOutput({ status: "success", data: getTukarSemua() });
}
function simpanTukar(data) {
  if (!cekAdmin(data)) return jsonOutput({ status: "error", message: "Email atau password admin salah." });
  const tanggal = String(data.tanggal || "").substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return jsonOutput({ status: "error", message: "Tanggal tidak valid." });
  const asal = cariPersonel(data.idAsal), pengganti = cariPersonel(data.idPengganti);
  if (!asal || !pengganti) return jsonOutput({ status: "error", message: "Personel asal/pengganti tidak ditemukan." });
  if (asal.id === pengganti.id) return jsonOutput({ status: "error", message: "Personel asal dan pengganti tidak boleh sama." });
  const cacheJadwal = {};
  const shiftAsal = shiftEfektif(asal.id, tanggal, cacheJadwal, []); // shift menurut grid (tanpa tukar sebelumnya)
  if (!SHIFT_DEF[shiftAsal]) return jsonOutput({ status: "error", message: asal.nama + " tidak punya shift pada " + tanggal + " menurut jadwal." });
  const now = new Date();
  getSheetTukar().appendRow([now, tanggal, shiftAsal, asal.id, asal.nama, pengganti.id, pengganti.nama, data.alasan || ""]);
  // Dua arah (tukar penuh): shift pengganti pada tanggal tsb dialihkan balik ke asal.
  if (data.duaArah) {
    const shiftPengganti = shiftEfektif(pengganti.id, tanggal, cacheJadwal, []);
    if (SHIFT_DEF[shiftPengganti]) {
      getSheetTukar().appendRow([now, tanggal, shiftPengganti, pengganti.id, pengganti.nama, asal.id, asal.nama, (data.alasan || "") + " (tukar dua arah)"]);
    }
  }
  return jsonOutput({ status: "success", message: "Tukar/ganti piket dicatat. Shift " + shiftAsal + " tanggal " + tanggal + ": " + asal.nama + " → " + pengganti.nama + "." });
}
function hapusTukar(data) {
  if (!cekAdmin(data)) return jsonOutput({ status: "error", message: "Email atau password admin salah." });
  const rowIndex = parseInt(data.rowIndex, 10);
  if (!rowIndex || rowIndex < 2) return jsonOutput({ status: "error", message: "Baris tidak valid." });
  getSheetTukar().deleteRow(rowIndex);
  return jsonOutput({ status: "success", message: "Catatan tukar piket dihapus." });
}

/* ---------- Data untuk Daftar Hadir bulanan (laporan.html) ---------- */
function dataLaporan(data) {
  if (!cekAdmin(data)) return jsonOutput({ status: "error", message: "Email atau password admin salah." });
  const bulan = data.bulan;
  if (!/^\d{4}-\d{2}$/.test(bulan || "")) return jsonOutput({ status: "error", message: "Format bulan harus YYYY-MM." });
  const jdw = getJadwalBulan(bulan);
  const personel = getPersonel().filter(function (x) { return x.aktif; }).map(function (x) {
    return { id: x.id, nama: x.nama, jabatan: x.jabatan, shifts: jdw[x.id] ? jdw[x.id].shifts : null };
  });
  const absen = [];
  const sheetA = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ABSEN);
  if (sheetA) {
    const va = sheetA.getDataRange().getValues(); va.shift();
    va.forEach(function (r) {
      const tgl = r[4] instanceof Date ? fmt(r[4], "yyyy-MM-dd") : String(r[4] || "").substring(0, 10);
      if (tgl.substring(0, 7) !== bulan) return;
      absen.push({ id: String(r[2]), tanggalDinas: tgl, shift: String(r[5]), jenis: String(r[6]), status: String(r[7] || ""), jam: r[9] instanceof Date ? fmt(r[9], "HH:mm") : String(r[9] || "") });
    });
  }
  const izinRows = [];
  const sheetI = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_IZIN);
  if (sheetI) {
    const vi = sheetI.getDataRange().getValues(); vi.shift();
    vi.forEach(function (r) {
      const mulai = r[5] instanceof Date ? fmt(r[5], "yyyy-MM-dd") : String(r[5] || "").substring(0, 10);
      const selesai = r[6] instanceof Date ? fmt(r[6], "yyyy-MM-dd") : String(r[6] || "").substring(0, 10) || mulai;
      izinRows.push({ id: String(r[2]), jenis: String(r[4]), mulai: mulai, selesai: selesai });
    });
  }
  const set = getPengaturan();
  return jsonOutput({
    status: "success", bulan: bulan, personel: personel, absen: absen, izin: izinRows,
    tukar: getTukarSemua().filter(function (t) { return t.tanggal.substring(0, 7) === bulan; }),
    shiftDef: labelShiftDef(),
    namaInstansi: set.namaInstansi, namaKoordinator: set.namaKoordinator,
    namaPengesah: set.namaPengesah, jabatanPengesah: set.jabatanPengesah
  });
}

/* ---------- Pengaturan ---------- */
function simpanPengaturan(data) {
  if (!cekAdmin(data)) return jsonOutput({ status: "error", message: "Email atau password admin salah." });
  // Perubahan akun admin utama hanya boleh oleh admin utama (bukan operator).
  if ((data.passwordBaru || data.emailAdminBaru) && !isPrimaryAdmin(data)) {
    return jsonOutput({ status: "error", message: "Hanya admin utama yang dapat mengubah email/password admin utama." });
  }
  const p = props();
  if (data.lat !== undefined && data.lat !== "") p.setProperty("POS_LAT", String(data.lat));
  if (data.lng !== undefined && data.lng !== "") p.setProperty("POS_LNG", String(data.lng));
  if (data.radius !== undefined && data.radius !== "") p.setProperty("POS_RADIUS", String(data.radius));
  if (data.namaInstansi) p.setProperty("NAMA_INSTANSI", data.namaInstansi);
  if (data.namaKoordinator !== undefined) p.setProperty("NAMA_KOORDINATOR", String(data.namaKoordinator));
  if (data.namaPengesah !== undefined) p.setProperty("NAMA_PENGESAH", String(data.namaPengesah));
  if (data.jabatanPengesah !== undefined) p.setProperty("JABATAN_PENGESAH", String(data.jabatanPengesah));
  if (data.tolTelat !== undefined && data.tolTelat !== "") p.setProperty("TOL_TELAT", String(parseInt(data.tolTelat, 10) || 0));
  if (data.tolCepat !== undefined && data.tolCepat !== "") p.setProperty("TOL_CEPAT", String(parseInt(data.tolCepat, 10) || 0));
  if (data.abaikanLokasi !== undefined) p.setProperty("ABAIKAN_LOKASI", data.abaikanLokasi ? "true" : "false");
  if (data.passwordBaru) {
    if (String(data.passwordBaru).length < 6) return jsonOutput({ status: "error", message: "Password baru minimal 6 karakter." });
    p.setProperty("ADMIN_PASSWORD", String(data.passwordBaru));
  }
  if (data.emailAdminBaru) {
    if (String(data.emailAdminBaru).indexOf("@") === -1) return jsonOutput({ status: "error", message: "Email admin tidak valid." });
    p.setProperty("ADMIN_EMAIL", String(data.emailAdminBaru).trim());
  }
  return jsonOutput({ status: "success", message: "Pengaturan disimpan." });
}

function getAdminPassword() {
  let pw = props().getProperty("ADMIN_PASSWORD");
  if (!pw) { pw = "admin123"; props().setProperty("ADMIN_PASSWORD", pw); }
  return pw;
}
function getAdminEmail() {
  let em = props().getProperty("ADMIN_EMAIL");
  if (!em) { em = "dausdaba@polikpsorong.ac.id"; props().setProperty("ADMIN_EMAIL", em); }
  return em;
}
function isPrimaryAdmin(data) {
  const emailOk = data.email !== undefined && String(data.email).trim().toLowerCase() === getAdminEmail().toLowerCase();
  const passOk = data.password !== undefined && String(data.password) === getAdminPassword();
  return emailOk && passOk;
}
function cekAdmin(data) {
  if (isPrimaryAdmin(data)) return true;
  if (data.email === undefined || data.password === undefined) return false;
  const email = String(data.email).trim().toLowerCase();
  const pass = String(data.password);
  const ops = getOperator();
  for (var i = 0; i < ops.length; i++) {
    if (ops[i].aktif && ops[i].email.toLowerCase() === email && ops[i].password === pass) return true;
  }
  return false;
}

/* ---------- Operator (akun admin tambahan) ---------- */
function getOperator() {
  const values = getSheetOperator().getDataRange().getValues();
  values.shift();
  return values.map(function (r, i) {
    return { rowIndex: i + 2, email: String(r[0] || "").trim(), password: String(r[1] || ""), nama: r[2] || "", aktif: String(r[3] || "ya") === "ya" };
  }).filter(function (x) { return x.email; });
}
function cariOperator(email) {
  const e = String(email || "").trim().toLowerCase();
  return getOperator().filter(function (o) { return o.email.toLowerCase() === e; })[0] || null;
}
/* Untuk halaman Rekap yang hanya mengirim password (tanpa email):
   terima password admin utama ATAU password operator aktif mana pun. */
function passwordAdminAtauOperator(pw) {
  if (!pw) return false;
  pw = String(pw);
  if (pw === getAdminPassword()) return true;
  const ops = getOperator();
  for (var i = 0; i < ops.length; i++) {
    if (ops[i].aktif && ops[i].password && ops[i].password === pw) return true;
  }
  return false;
}
function simpanOperator(data) {
  if (!isPrimaryAdmin(data)) return jsonOutput({ status: "error", message: "Hanya admin utama yang dapat mengelola operator." });
  const email = String(data.emailOperator || "").trim();
  if (!email || email.indexOf("@") === -1) return jsonOutput({ status: "error", message: "Email operator tidak valid." });
  if (email.toLowerCase() === getAdminEmail().toLowerCase()) return jsonOutput({ status: "error", message: "Email itu sudah menjadi admin utama." });
  const sheet = getSheetOperator();
  const ada = cariOperator(email);
  let password = ada ? ada.password : "";
  if (data.passwordOperator) {
    if (String(data.passwordOperator).length < 6) return jsonOutput({ status: "error", message: "Password operator minimal 6 karakter." });
    password = String(data.passwordOperator);
  }
  if (!ada && !password) return jsonOutput({ status: "error", message: "Password wajib diisi untuk operator baru." });
  const nama = data.namaOperator !== undefined && String(data.namaOperator).trim() ? String(data.namaOperator).trim() : (ada ? ada.nama : "Operator");
  const aktif = data.aktifOperator === false ? "tidak" : "ya";
  const row = [email, password, nama, aktif];
  if (ada) sheet.getRange(ada.rowIndex, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  return jsonOutput({ status: "success", message: "Operator " + email + " tersimpan." });
}
function hapusOperator(data) {
  if (!isPrimaryAdmin(data)) return jsonOutput({ status: "error", message: "Hanya admin utama yang dapat mengelola operator." });
  const ada = cariOperator(data.emailOperator);
  if (!ada) return jsonOutput({ status: "error", message: "Operator tidak ditemukan." });
  getSheetOperator().deleteRow(ada.rowIndex);
  return jsonOutput({ status: "success", message: "Operator dihapus." });
}

/* ====================== DATA HELPER ==================== */
function props() { return PropertiesService.getScriptProperties(); }

function getPengaturan() {
  const p = props();
  return {
    lat: parseFloat(p.getProperty("POS_LAT") || ""),
    lng: parseFloat(p.getProperty("POS_LNG") || ""),
    radius: parseInt(p.getProperty("POS_RADIUS") || "0", 10),
    namaInstansi: p.getProperty("NAMA_INSTANSI") || "Politeknik Kelautan dan Perikanan Sorong",
    tolTelat: parseInt(p.getProperty("TOL_TELAT") || String(DEFAULT_TOL_TELAT), 10),
    tolCepat: parseInt(p.getProperty("TOL_CEPAT") || String(DEFAULT_TOL_CEPAT), 10),
    abaikanLokasi: (p.getProperty("ABAIKAN_LOKASI") || "true") === "true",
    namaKoordinator: p.getProperty("NAMA_KOORDINATOR") || "",
    namaPengesah: p.getProperty("NAMA_PENGESAH") || "",
    jabatanPengesah: p.getProperty("JABATAN_PENGESAH") || "Kasub Bagian Umum"
  };
}
function getPengaturanPublic() {
  const s = getPengaturan();
  return {
    lat: isNaN(s.lat) ? "" : s.lat, lng: isNaN(s.lng) ? "" : s.lng, radius: s.radius || "",
    namaInstansi: s.namaInstansi, tolTelat: s.tolTelat, tolCepat: s.tolCepat,
    abaikanLokasi: s.abaikanLokasi, adminEmail: getAdminEmail(),
    namaKoordinator: s.namaKoordinator, namaPengesah: s.namaPengesah, jabatanPengesah: s.jabatanPengesah
  };
}

function perbaikiHeader() {
  [[SHEET_ABSEN, HEADER_ABSEN], [SHEET_PATROLI, HEADER_PATROLI], [SHEET_IZIN, HEADER_IZIN],
   [SHEET_PERANGKAT, HEADER_PERANGKAT], [SHEET_PERSONEL, HEADER_PERSONEL],
   [SHEET_JADWAL, HEADER_JADWAL], [SHEET_TUKAR, HEADER_TUKAR]]
    .forEach(function (pair) {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(pair[0]);
      if (!sheet) return;
      sheet.getRange(1, 1, 1, pair[1].length).setValues([pair[1]]).setFontWeight("bold");
    });
}

function seedDataAwal() {
  // Idempotent: hanya mengisi jika sheet masih kosong.
  const shPer = getSheetPersonel();
  if (shPer.getDataRange().getNumRows() < 2) {
    shPer.getRange(2, 1, SEED_PERSONEL.length, HEADER_PERSONEL.length).setValues(SEED_PERSONEL);
  }
  const shJdw = getSheetJadwal();
  if (shJdw.getDataRange().getNumRows() < 2) {
    const rows = SEED_PERSONEL.map(function (per) {
      return [SEED_JADWAL_BULAN, per[0], per[1]].concat(SEED_JADWAL[per[0]]);
    });
    shJdw.getRange(2, 1, rows.length, HEADER_JADWAL.length).setValues(rows);
  }
}

function getSheetAbsen() { return getOrCreateSheet(SHEET_ABSEN, HEADER_ABSEN); }
function getSheetPatroli() { return getOrCreateSheet(SHEET_PATROLI, HEADER_PATROLI); }
function getSheetIzin() { return getOrCreateSheet(SHEET_IZIN, HEADER_IZIN); }
function getSheetPerangkat() { return getOrCreateSheet(SHEET_PERANGKAT, HEADER_PERANGKAT); }
function getSheetPersonel() { return getOrCreateSheet(SHEET_PERSONEL, HEADER_PERSONEL); }
function getSheetJadwal() { return getOrCreateSheet(SHEET_JADWAL, HEADER_JADWAL); }
function getSheetTukar() { return getOrCreateSheet(SHEET_TUKAR, HEADER_TUKAR); }
function getSheetOperator() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_OPERATOR);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_OPERATOR);
    sheet.appendRow(HEADER_OPERATOR);
    sheet.getRange(1, 1, 1, HEADER_OPERATOR.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    // Seed operator awal saat sheet pertama kali dibuat (tanpa perlu jalankan setup ulang).
    SEED_OPERATOR.forEach(function (r) { sheet.appendRow(r); });
  }
  return sheet;
}
function getOrCreateSheet(nama, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(nama);
  if (!sheet) {
    sheet = ss.insertSheet(nama);
    sheet.appendRow(header);
    sheet.getRange(1, 1, 1, header.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getFolder() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_NAME);
}
function simpanFoto(base64, nama, jenis, waktu) {
  const folder = getFolder();
  const parts = base64.split(",");
  const meta = parts[0].match(/:(.*?);/);
  const contentType = meta ? meta[1] : "image/jpeg";
  const bytes = Utilities.base64Decode(parts[1]);
  const namaFile = [String(nama || "tanpa-nama").replace(/[^\w]+/g, "_"), jenis || "foto", fmt(waktu, "yyyyMMdd_HHmmss")].join("_") + ".jpg";
  const blob = Utilities.newBlob(bytes, contentType, namaFile);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = function (x) { return x * Math.PI / 180; };
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function fmt(d, f) { return Utilities.formatDate(d, TZ, f); }
function jsonOutput(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
