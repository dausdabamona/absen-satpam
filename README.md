# 🛡️ Absen Satpam — Piket Pos

Aplikasi absensi untuk personel satpam **piket pos 24 jam** di Politeknik
Kelautan dan Perikanan Sorong. Frontend berupa **situs statis** (GitHub Pages,
vanilla HTML/CSS/JS tanpa framework & tanpa build step), backend **Google Apps
Script + Google Sheets**. Identitas menempel pada **perangkat (HP)** — tanpa
login untuk personel.

- **Situs (setelah deploy):** `https://dausdabamona.github.io/absen-satpam/`
- **Target perangkat:** Android low-end, koneksi tidak stabil. Seluruh UI Bahasa Indonesia.

---

## ✨ Fitur

| Halaman | Untuk | Isi |
|---|---|---|
| `index.html` | Personel (HP) | Absen selfie + GPS, kartu "Piket Saya", jurnal patroli berfoto tiap 2 jam, izin/sakit, lihat jadwal |
| `admin.html` | Admin (desktop) | Beranda status piket hari ini, grid jadwal bulanan, tukar piket, personel, perangkat, pengaturan |
| `rekap.html` | Personel / Admin | Rekap Absensi/Patroli/Izin + ekspor CSV |
| `laporan.html` | Admin | Daftar Hadir bulanan siap cetak (A4 landscape) untuk lampiran pembayaran |

Kunci desain:
- **Absen wajib selfie** (kamera depan) + **geofence** pos jaga (bisa dimatikan admin = mode uji coba).
- **Jadwal shift** diisi admin lewat grid orang × tanggal.
- **Tukar/ganti piket dicatat admin**, otomatis memengaruhi validasi absen, kartu piket, dan laporan.

---

## ⏱️ Konsep shift & "Tanggal Dinas"

| Kode | Jam | Keterangan |
|---|---|---|
| I | 08.00–16.00 | biasanya Koordinator K5 |
| II | 16.00–24.00 | |
| III | 00.00–08.00 | |
| IV | 00.00–12.00 | 12 jam (menutup hari off rekan) |
| V | 12.00–24.00 | 12 jam |
| `-` | Off | |

**Tanggal dinas ≠ tanggal kalender.** Absen pulang shift II jam 00.10 milik
tanggal dinas *kemarin*; absen masuk shift III jam 23.45 milik tanggal dinas
*besok*. Server (`tentukanAbsen` di `Code.gs`) yang menentukan (tanggal dinas,
shift, jenis Masuk/Pulang, status waktu). Jendela absen ±4 jam dari jam
mulai/selesai shift. Logika ini diverifikasi 20 kasus uji:

```bash
node test/logika-shift.test.js      # harus: 20 lulus, 0 gagal
```

---

## 📁 Struktur repo

```
index.html   admin.html   rekap.html   laporan.html   README.md
css/style.css                       ← satu gaya untuk semua halaman
js/config.js                        ← CONFIG, SHIFT_INFO, getDeviceId(), API.post()
js/app.js  js/admin.js  js/rekap.js  js/laporan.js
google-apps-script/Code.gs          ← backend (kontrak API) + appsscript.json
test/logika-shift.test.js           ← 20 uji logika shift
.clasp.json  package.json           ← alat clasp (push/deploy backend)
.github/workflows/deploy.yml        ← deploy Pages + injeksi Secret APPS_SCRIPT_URL
.nojekyll
```

Data awal (seed) di backend: 4 personel — **P1 Klemens M. Burdam**
(Koordinator K5), P2 Muhamad Merin, P3 Naftali Mandibo, P4 Agustinus Lado —
dan jadwal piket **Juli 2026** sesuai PDF resmi.

---

## 🚀 Pemasangan

### 1) Backend — Google Apps Script (Code.gs)

Backend membuat semua tab Google Sheet + seed data lewat fungsi `setup`.
Ada dua cara memasangnya.

#### Cara A — via `clasp` (dianjurkan)

Prasyarat: **Node.js**, dan **Apps Script API** diaktifkan sekali di
<https://script.google.com/home/usersettings> (setel **ON**).

```bash
npm install                 # memasang clasp (devDependency)
npm run gas:login           # login akun Google pemilik project Apps Script
npm run gas:status          # cek: yang di-push hanya google-apps-script/Code.gs + appsscript.json
npm run gas:push            # unggah Code.gs ke project
```

`.clasp.json` sudah menunjuk ke project Apps Script (field `scriptId`).
Ganti `scriptId` bila memakai project lain.

Setelah push, **jalankan `setup` sekali**: buka editor (`npx clasp open-script`)
→ pilih fungsi `setup` → **Run** → izinkan akses. Ini membuat tab + seed +
menyetel password admin awal `admin123`.

> Perintah clasp langsung juga tersedia bila clasp terpasang global
> (`npm install -g @google/clasp`): `clasp login`, `clasp push -f`, dst.

#### Cara B — tempel manual

1. Buat Google Sheet baru → **Ekstensi → Apps Script**.
2. Tempel isi `google-apps-script/Code.gs` ke `Code.gs`; sesuaikan
   `appsscript.json` bila perlu (zona `Asia/Jayapura`).
3. Jalankan fungsi `setup` sekali (izinkan akses).

### 2) Deploy Web App + kelola deployment

Buat deployment web app agar dapat URL `/exec`:

```bash
npm run gas:deploy                       # = clasp deploy -d "Absen Satpam"
# → catat "Deployment ID" (AKfycb…)
# URL backend = https://script.google.com/macros/s/<Deployment ID>/exec
```

Atau manual di editor: **Deploy → New deployment → Web app**, *Execute as: Me*,
*Who has access: **Anyone***, lalu salin URL `/exec`.

**Update backend berikutnya** — supaya URL `/exec` **tetap sama**, perbarui
deployment yang sama (jangan buat baru):

```bash
npm run gas:push                         # unggah perubahan Code.gs
npm run gas:redeploy -- <Deployment ID> -d "revisi"   # = clasp redeploy <id> -d "..."
```

Kelola deployment:

```bash
npm run gas:list                         # daftar semua deployment (clasp deployments)
npx clasp undeploy <Deployment ID>       # hapus salah satu deployment
```

Ringkasan skrip npm (`package.json`):

| Skrip | Fungsi |
|---|---|
| `npm run gas:login` | login Google (clasp) |
| `npm run gas:push` | unggah `Code.gs` (`clasp push -f`) |
| `npm run gas:deploy` | buat deployment baru |
| `npm run gas:redeploy -- <id> -d "…"` | perbarui deployment (URL tetap) |
| `npm run gas:list` | daftar deployment |
| `npm test` | jalankan 20 uji logika shift |

### 3) Frontend — GitHub Pages

1. **Secret URL backend:** repo GitHub → **Settings → Secrets and variables →
   Actions → New repository secret** → nama `APPS_SCRIPT_URL`, nilai URL `/exec`.
   URL backend **tidak** disimpan di kode sumber — workflow menyisipkannya ke
   `js/config.js` saat deploy.
2. **Aktifkan Pages:** **Settings → Pages → Source: GitHub Actions**
   (workflow `.github/workflows/deploy.yml` sudah ada; berjalan saat push ke
   `main` atau via *Run workflow*).
3. Situs terbit di `https://dausdabamona.github.io/absen-satpam/`.

---

## 🧭 Alur penggunaan

### Admin (langkah awal — penting)

1. Buka `admin.html`, login **email admin** + password awal **`admin123`**.
   (Email admin awal: `dausdaba@polikpsorong.ac.id`.)
2. **Pengaturan → ganti password** (dan email bila perlu).
3. **Pengaturan → set lokasi pos** ("Gunakan Lokasi Saya" saat berada di pos)
   + radius (mis. 100 m), lalu **matikan "Mode Uji Coba"** saat produksi agar
   geofence aktif.
4. **Jadwal** → pilih bulan → isi grid shift → **Simpan**. Tombol "Salin bulan
   sebelumnya" mempercepat penyusunan.
5. **Perangkat** → **Setujui** HP personel yang mendaftar.
6. **Tukar Piket** → catat bila ada pengalihan piket (memengaruhi absen & laporan).

> **Operator (akun admin tambahan):** admin utama dapat menambah operator di
> **Pengaturan → Operator** (email + password, min. 6 karakter). Operator bisa
> login & mengelola aplikasi seperti admin, KECUALI menambah/menghapus operator
> lain dan mengubah akun admin utama. Operator awal sudah ter-seed:
> `skprahim05@gmail.com` (password awal `operator123` — segera ganti). Data
> operator disimpan di sheet **Operator**.

### Personel (HP)

1. Buka situs → pilih nama dari daftar → **Daftarkan Perangkat** → tunggu admin menyetujui.
2. Setelah disetujui: **Absen** (selfie + Ambil Lokasi → Kirim), jenis
   Masuk/Pulang otomatis dari server.
3. **Patroli** tiap 2 jam (foto wajib) — ada pengingat saat tab terbuka.
4. **Izin/Sakit** dengan foto surat bila berhalangan.

### Laporan pembayaran

`laporan.html` → isi kredensial admin + bulan → **Tampilkan** → **Cetak**
(A4 landscape). Sel memakai shift efektif (jadwal + tukar) dengan status
hadir/parsial/mangkir/izin, plus kolom ringkasan & blok tanda tangan.

---

## 🔒 Catatan keamanan

- File `.clasprc.json` (token OAuth clasp) **tidak boleh** di-commit — sudah
  diabaikan di `.gitignore`.
- `js/config.js` di repo hanya berisi placeholder `__APPS_SCRIPT_URL__`; URL
  asli disuntik saat deploy dari Secret.
- Password admin disimpan di Script Properties backend, bukan di frontend.

## 🛠️ Pemecahan masalah

| Gejala | Solusi |
|---|---|
| `clasp push`: *"User has not enabled the Apps Script API"* | Aktifkan di <https://script.google.com/home/usersettings>, tunggu ~1 menit |
| Frontend: "Server belum dikonfigurasi" | Secret `APPS_SCRIPT_URL` belum diisi / belum deploy ulang Pages |
| Absen ditolak "di luar area pos" | Set lokasi & radius benar, atau hidupkan Mode Uji Coba sementara |
| "Tidak ada jadwal piket di sekitar waktu ini" | Jadwal bulan itu belum diisi, atau ada tukar piket yang belum dicatat |
| Personel tak muncul di daftar | Pastikan personel **Aktif** di menu Personel |
