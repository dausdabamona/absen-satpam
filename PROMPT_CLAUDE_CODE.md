# PROMPT CLAUDE CODE — Aplikasi Absen Satpam (Piket Pos) Poltek KP Sorong

> Cara pakai: buka repo `dausdabamona/absen-satpam` di Claude Code, lalu berikan
> prompt: **"Baca PROMPT_CLAUDE_CODE.md dan kerjakan sesuai spesifikasi di
> dalamnya."** Kerjakan bertahap per halaman, commit kecil & sering.

---

## 1. Konteks

Aplikasi absensi untuk 4 personel satpam (piket pos 24 jam) Politeknik KP
Sorong, di-fork dari pola aplikasi "Absensi PJLP" yang sudah berjalan:

- **Frontend**: situs statis GitHub Pages (repo ini) — vanilla HTML/CSS/JS,
  TANPA framework, TANPA build step. Target: Android low-end (RAM 2-3 GB),
  koneksi tidak stabil. Seluruh UI Bahasa Indonesia.
- **Backend**: Google Apps Script Web App + Google Sheets
  (`google-apps-script/Code.gs` — **SUDAH SELESAI & TERUJI, JANGAN DITULIS
  ULANG**; boleh dibaca sebagai kontrak API).
- **Identitas berbasis perangkat**: tanpa login. HP didaftarkan (pilih nama
  dari dropdown personel), admin menyetujui. Device ID di localStorage
  (`satpam_device_id`, lihat `js/config.js`).

Keputusan desain yang SUDAH final (jangan diubah):

1. Aplikasi terpisah dari aplikasi PJLP (instans, sheet, deployment sendiri).
2. Jadwal bulanan diisi admin lewat **grid orang × tanggal** di panel admin.
3. Absen wajib **selfie** (kamera depan) + **geofence** pos jaga
   (geofence bisa dimatikan admin = mode uji coba).
4. **Jurnal patroli berfoto tiap 2 jam** selama piket (pengingat di frontend).
5. **Tukar/ganti piket dicatat admin** (bukan diajukan personel) dan otomatis
   memengaruhi validasi absen + rekap.

## 2. Konsep inti: shift & tanggal dinas

| Kode | Jam | Keterangan |
|---|---|---|
| I | 08.00–16.00 | biasanya Koordinator K5 |
| II | 16.00–24.00 | |
| III | 00.00–08.00 | |
| IV | 00.00–12.00 | 12 jam, menutup hari off rekan |
| V | 12.00–24.00 | 12 jam |
| `-` | Off | |

**Tanggal dinas ≠ tanggal kalender.** Absen pulang shift II jam 00.10 milik
tanggal dinas KEMARIN; absen masuk shift III jam 23.45 milik tanggal dinas
BESOK. Server (`tentukanAbsen` di Code.gs) yang memutuskan
(tanggal dinas, shift, jenis Masuk/Pulang, status waktu) — frontend TIDAK
menghitung ini, cukup menampilkan hasil dari server. Jendela absen ±4 jam
dari jam mulai/selesai shift. Logika ini diverifikasi 20 kasus uji di
`test/logika-shift.test.js` (`node test/logika-shift.test.js` → 20 lulus).

## 3. Status repo saat ini (modal awal — SUDAH ADA)

```
google-apps-script/Code.gs        ← backend lengkap & teruji (kontrak API)
google-apps-script/appsscript.json
js/config.js                      ← CONFIG, SHIFT_INFO, getDeviceId(), API.post()
test/logika-shift.test.js         ← 20 uji logika shift (semua lulus)
.github/workflows/deploy.yml      ← deploy Pages + injeksi Secret APPS_SCRIPT_URL
.nojekyll
PROMPT_CLAUDE_CODE.md             ← file ini
```

Backend sudah men-seed: 4 personel (P1 Klemens M. Burdam/Koordinator K5,
P2 Muhamad Merin, P3 Naftali Mandibo, P4 Agustinus Lado) dan jadwal piket
Juli 2026 lengkap sesuai PDF jadwal resmi.

## 4. Yang HARUS dibangun (urutan pengerjaan)

1. `css/style.css` — satu file CSS untuk semua halaman
2. `index.html` + `js/app.js` — halaman absen personel (mobile-first)
3. `admin.html` + `js/admin.js` — panel admin (desktop, sidebar)
4. `rekap.html` + `js/rekap.js` — rekap tabel + ekspor CSV
5. `laporan.html` + `js/laporan.js` — Daftar Hadir bulanan siap cetak
6. `README.md` — panduan pasang backend, konfigurasi, deploy, penggunaan

## 5. Kontrak API (doPost, body JSON, selalu sertakan `deviceId`)

Semua respons: `{status:"success"|"error", message?, ...}`. Aksi admin butuh
`email` + `password`; rekap admin butuh `adminPassword`.

| action | payload penting | respons penting |
|---|---|---|
| `listPersonel` | — | `personel: [{id,nama,jabatan}]` (untuk dropdown daftar) |
| `daftarPerangkat` | `personelId` | `deviceStatus:"pending"` |
| `cekPerangkat` | — | `terdaftar, deviceStatus, personelId, nama` |
| `jadwalSaya` | `bulan?` (YYYY-MM) | `bulan, nama, shifts[31]` (sudah termasuk koreksi tukar), `shiftDef`, `hariIni:{tanggal,shift}, besok:{tanggal,shift}` |
| `absen` | `foto` (dataURL selfie, WAJIB), `lat,lng,akurasi`, `keterangan?` | pesan berisi jenis+shift+tanggal dinas+status; error jika: tanpa selfie, di luar radius, tidak ada jadwal di jendela waktu, atau absen ganda |
| `patroli` | `kegiatan`, `foto` (WAJIB), `lat?,lng?` | — |
| `izin` | `jenis` (Izin/Sakit/Cuti/Dinas Luar/Lainnya), `tglMulai`, `tglSelesai?`, `alasan`, `foto` (WAJIB) | — |
| `rekapAbsensi` / `rekapPatroli` / `rekapIzin` | `adminPassword?` | `data:[obj per HEADER_*], isAdmin` — tanpa password: hanya data personel perangkat ini |
| `adminLogin` | email, password | — |
| `adminData` | — | `perangkat[], personel[], pengaturan{}` |
| `setStatusPerangkat` | `deviceId`(target), `statusBaru`: pending/disetujui/diblokir | — |
| `hapusPerangkat` | `deviceId`(target) | — |
| `adminJadwal` | `bulan` | `baris:[{id,nama,jabatan,shifts[31]}], shiftDef` |
| `simpanJadwal` | `bulan, baris:[{id,shifts[31]}]` (nilai: I/II/III/IV/V/-) | — |
| `adminTukar` | — | `data:[{rowIndex,tanggal,shift,idAsal,namaAsal,idPengganti,namaPengganti,alasan}]` |
| `simpanTukar` | `tanggal, idAsal, idPengganti, alasan?, duaArah?` (bool) | shift asal otomatis dibaca dari jadwal |
| `hapusTukar` | `rowIndex` | — |
| `simpanPersonel` | `id, nama, jabatan?, aktif?` (bool) | — |
| `dataLaporan` | `bulan` | `personel[](+shifts), absen[], izin[], tukar[], shiftDef, namaInstansi, namaKoordinator, namaPengesah, jabatanPengesah` |
| `simpanPengaturan` | `lat,lng,radius, namaInstansi, namaKoordinator, namaPengesah, jabatanPengesah, tolTelat, tolCepat, abaikanLokasi, passwordBaru?, emailAdminBaru?` | — |

Kolom sheet Absensi (urutan `HEADER_ABSEN`): Timestamp, Device ID,
ID Personel, Nama, **Tanggal Dinas**, **Shift**, Jenis, Status Waktu,
Tanggal, Jam, **Foto Selfie**, Latitude, Longitude, Akurasi (m), Jarak (m),
Link Lokasi, Keterangan.

## 6. Spesifikasi per halaman

### 6.1 `index.html` + `js/app.js` (halaman personel, mobile-first ≤480px)

Alur status seperti PJLP: loading → daftar / pending / blokir / absen.

- **Redirect**: perangkat desktop atau yang pernah login admin
  (`localStorage satpam_admin_device === "1"`) diarahkan ke `admin.html`;
  paksa halaman absen dengan `?absen=1`.
- **Pendaftaran**: dropdown nama dari `listPersonel` (BUKAN input teks bebas)
  → `daftarPerangkat {personelId}` → tampilan pending.
- **Header**: jam digital real-time WIT (pakai `CONFIG.OFFSET_JAM`).
- **Kartu "Piket Saya"** (data `jadwalSaya`): hari ini + besok, mis.
  "Hari ini: Shift II (16.00–24.00)" atau "Hari ini: Libur/Off". Tampilkan
  menonjol di atas form absen.
- **Tab**: Absen | Patroli | Izin/Sakit | Jadwal.
- **Tab Absen**: (1) selfie WAJIB — `<input type="file" accept="image/*"
  capture="user">`, kompres canvas maks lebar 800px kualitas 0.7, preview;
  (2) tombol Ambil Lokasi GPS; (3) keterangan opsional; (4) tombol kirim
  muncul setelah selfie+lokasi ada, label cukup "Kirim Absen" (jenis
  ditentukan server). Tampilkan pesan sukses/gagal dari server apa adanya
  (berisi shift & tanggal dinas). Ringkasan bulan berjalan pribadi
  (hadir/telat/pulang cepat) dari `rekapAbsensi` — hitung per (Tanggal
  Dinas, Jenis), bukan per tanggal kalender.
- **Tab Patroli**: deskripsi + foto wajib + lokasi opsional → `patroli`.
  Pengingat tiap `CONFIG.INTERVAL_PATROLI_MENIT` (banner + Notification API +
  beep) selama tab terbuka — pola sama dgn PJLP. Tandai terisi saat submit.
- **Tab Izin/Sakit**: jenis, tanggal mulai/selesai, alasan, foto surat wajib.
- **Tab Jadwal**: daftar 1 bulan (baris per tanggal: tgl, hari, badge shift +
  jam), bulan bisa diganti (input month). Data `jadwalSaya {bulan}`.
  Tandai hari ini. Badge warna per shift (lihat §7).

### 6.2 `admin.html` + `js/admin.js` (desktop, sidebar gelap seperti PJLP)

Login email+password (`adminLogin`), simpan di sessionStorage
(`satpam_admin_pw`, `satpam_admin_email`), auto-login, tombol keluar.
Sidebar: Beranda, Jadwal, Tukar Piket, Personel, Perangkat, Pengaturan +
tautan ke Rekap & Laporan.

- **Beranda**: KPI hari ini — untuk setiap personel yang punya shift hari
  ini/berjejer per shift: nama, shift, status (belum absen / sudah Masuk
  jam X / sudah Pulang). Sumber: `adminJadwal` bulan ini + `adminTukar` +
  `rekapAbsensi` (filter Tanggal Dinas = hari ini). Perhatian: shift II/V
  pulangnya besok — status "belum pulang" sebelum 24.00 itu normal, jangan
  ditandai merah sebelum jam selesai shift terlewati. Plus daftar perangkat
  pending.
- **Jadwal**: input month → `adminJadwal` → tabel grid: baris personel,
  kolom 1–31 berisi `<select>` (-, I, II, III, IV, V). Kolom sesuai jumlah
  hari bulan tsb (28–31). Warna latar sel mengikuti shift. Baris bantu
  jumlah personel bertugas per hari (deteksi hari tanpa penjaga → sel merah
  bila 0 pada hari kerja koordinator pun kosong). Tombol Simpan →
  `simpanJadwal` (kirim 31 nilai, sisanya "-"). Tombol "Salin bulan
  sebelumnya" (load bulan lalu, tempel ke grid, TIDAK auto-save).
- **Tukar Piket**: form — tanggal, personel asal (tampilkan otomatis shift-nya
  pada tanggal itu, ambil dari `adminJadwal`), personel pengganti, alasan,
  checkbox "tukar dua arah". Submit → `simpanTukar`. Tabel riwayat
  (`adminTukar`) + tombol hapus per baris (`hapusTukar`, konfirmasi dulu).
- **Personel**: tabel + form tambah/edit (`simpanPersonel`). Nonaktifkan
  (aktif=false) alih-alih hapus.
- **Perangkat**: tabel seperti PJLP: setujui / blokir / hapus.
- **Pengaturan**: lokasi pos (lat/lng/radius + tombol "Gunakan Lokasi Saya"),
  switch mode uji coba (abaikanLokasi), toleransi telat & pulang cepat
  (menit), nama instansi, nama koordinator, nama & jabatan pengesah
  (untuk tanda tangan laporan), ganti email/password admin.

### 6.3 `rekap.html` + `js/rekap.js`

Terbuka: tanpa password tampil data personel perangkat ini; admin isi
password → semua. Tiga mode (tab): Absensi, Patroli, Izin. Filter: bulan
(default bulan ini, cocokkan dgn **Tanggal Dinas** untuk absensi), personel
(dropdown, admin saja). Tabel absensi: Tanggal Dinas, Shift, Nama, Jenis,
Jam, Status Waktu (badge merah utk Terlambat/Pulang Cepat), Selfie (link),
Jarak, Keterangan. Ekspor CSV sesuai filter aktif (BOM UTF-8 agar aman
dibuka Excel).

### 6.4 `laporan.html` + `js/laporan.js` — Daftar Hadir bulanan (dokumen pembayaran)

Halaman admin (email+password+bulan → `dataLaporan`). Ini lampiran
pertanggungjawaban pembayaran, harus rapi dicetak.

- Layout cetak A4 **landscape** (CSS `@media print`, `@page {size: A4
  landscape}`), tombol Cetak (`window.print()`).
- Kop sederhana: nama instansi, judul "DAFTAR HADIR PIKET POS SATPAM",
  "Bulan: Juli 2026".
- Tabel grid: baris per personel, kolom per tanggal (1..jumlah hari).
  Isi sel: kode shift EFEKTIF (jadwal + koreksi tukar) dengan status:
  - hadir lengkap (Masuk+Pulang tercatat utk tanggal dinas tsb) → sel normal ✓
  - hanya Masuk / hanya Pulang → sel kuning (∆)
  - tidak ada absen & tanggal sudah lewat → sel merah (X = mangkir),
    KECUALI tercakup rentang izin/sakit → tulis S/I/C/DL sesuai jenis
  - tanggal belum terjadi → tampilkan kode shift redup
  - off → "-"
- Kolom ringkasan per personel: jumlah shift dijadwalkan, hadir, terlambat
  (×), pulang cepat (×), mangkir, izin/sakit.
- Legenda + blok tanda tangan 2 kolom: kiri Koordinator K5
  (`namaKoordinator`), kanan `jabatanPengesah` + `namaPengesah`
  ("Mengetahui"). Tempat/tanggal: "Sorong, {tanggal cetak}".

## 7. Desain visual

Ikuti gaya PJLP (bersih, kartu putih, radius 14px, biru `#0d6efd`) tapi
identitas sendiri: aksen **hijau tua keamanan** `#14532d` + kuning aksen
`#eab308`. Ikon header 🛡️, judul "Absen Satpam — Piket Pos".
Badge warna shift konsisten di semua halaman:
I hijau, II biru, III ungu, IV oranye, V merah muda/magenta, Off abu-abu.
Tap target ≥44px, font sistem, tanpa webfont. Satu `css/style.css` untuk
semua halaman (boleh blok `@media print` khusus laporan di dalamnya atau
inline di laporan.html).

## 8. Konvensi kode (WAJIB)

- Vanilla JS pola IIFE `(function(){ "use strict"; ... })();` seperti
  aplikasi PJLP; tanpa framework, tanpa modul ES, kompatibel Chrome Android
  lama (hindari optional chaining `?.` dan arrow function bila mudah).
- Komentar & seluruh teks UI Bahasa Indonesia; pesan error jelas dan
  menyebut tindakan perbaikan.
- Setiap fetch: tampilkan state loading pada tombol, tangani error jaringan
  ("Gagal terhubung. Periksa koneksi lalu coba lagi."), jangan pernah
  membiarkan tombol mati permanen (selalu `finally`).
- Escape semua data sebelum masuk innerHTML (fungsi `esc()`).
- Kompresi foto sebelum kirim (selfie 800px q0.7; foto patroli/surat 1000px
  q0.7) — payload GAS terbatas.
- Commit: Conventional Commits Bahasa Indonesia
  (`feat: halaman absen personel`, dst), kecil & sering.

## 9. Kriteria selesai (checklist verifikasi)

- [ ] `node test/logika-shift.test.js` tetap 20/20 lulus (tidak menyentuh Code.gs).
- [ ] index.html: daftar → pending → (admin setujui) → absen; selfie & lokasi
      wajib sebelum tombol kirim muncul; pesan server (shift + tanggal dinas)
      tampil utuh.
- [ ] Kartu "Piket Saya" benar untuk shift II/III/IV/V dan hari off.
- [ ] Grid jadwal admin: load Juli 2026 menampilkan seed sesuai PDF; simpan
      lalu load ulang identik; bulan 30 hari hanya menampilkan 30 kolom.
- [ ] Tukar piket: catat pengalihan → kartu "Piket Saya" pengganti berubah,
      grid jadwalSaya berubah, laporan memakai shift efektif.
- [ ] Rekap: filter bulan pakai Tanggal Dinas; absen pulang 00.10 muncul di
      bulan tanggal dinasnya, bukan bulan kalender; CSV terbuka rapi di Excel.
- [ ] Laporan: cetak A4 landscape 1 halaman untuk 4 personel; status sel
      (✓/∆/X/S/I) benar; blok tanda tangan terisi dari pengaturan.
- [ ] Uji manual di layar 360px (DevTools) untuk index/rekap.
- [ ] README.md lengkap: pasang Code.gs + `setup`, deploy web app, isi Secret
      `APPS_SCRIPT_URL`, aktifkan Pages (GitHub Actions), alur admin awal
      (ganti password, matikan mode uji coba, set lokasi pos), alur personel.

## 10. Deployment (untuk README)

1. Sheet baru → Ekstensi → Apps Script → tempel `Code.gs` → jalankan `setup`
   sekali → Deploy Web app (Execute as: Me; Access: Anyone) → salin URL /exec.
2. Repo GitHub `dausdabamona/absen-satpam` → Settings → Secrets → Actions →
   `APPS_SCRIPT_URL` = URL /exec.
3. Settings → Pages → Source: **GitHub Actions** (workflow sudah ada).
   Situs: `https://dausdabamona.github.io/absen-satpam/`.
4. Admin login `admin.html` (password awal `admin123` — WAJIB diganti),
   set lokasi pos, matikan Mode Uji Coba saat produksi.
