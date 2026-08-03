/* ============================================================
   REKAP — Absen Satpam (rekap.html)
   Tanpa password: hanya data personel perangkat ini.
   Dengan password admin: semua personel + filter personel.
   ============================================================ */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function tampil(el, ya) { if (el) el.classList.toggle("tersembunyi", !ya); }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function pesan(el, tipe, teks) { if (el) el.innerHTML = teks ? '<div class="pesan ' + tipe + '">' + esc(teks) + '</div>' : ""; }
  var ERR_JARINGAN = "Gagal terhubung. Periksa koneksi lalu coba lagi.";

  function sekarangWIT() {
    var now = new Date();
    var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (CONFIG.OFFSET_JAM * 3600000));
  }
  function ymKini() { var d = sekarangWIT(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1); }
  function setMuat(btn, muat, teks) {
    if (!btn) return;
    if (muat) { btn.dataset.teksAsli = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> ' + (teks || "…"); }
    else { btn.disabled = false; if (btn.dataset.teksAsli) btn.innerHTML = btn.dataset.teksAsli; }
  }

  var MODE = "absensi";
  var ADMIN_PW = "";
  var isAdmin = false;
  var dataMentah = [];           // baris apa adanya dari server
  var dataTampil = [];           // baris setelah filter (untuk CSV)
  var petaNama = {};             // id -> nama (untuk dropdown)

  var ACTION = { absensi: "rekapAbsensi", patroli: "rekapPatroli", izin: "rekapIzin" };
  // Kolom yang ditampilkan per mode: [judul, kunciData, tipe]
  var KOLOM = {
    absensi: [
      ["Tanggal Dinas", "Tanggal Dinas", "teks"], ["Shift", "Shift", "shift"],
      ["Nama", "Nama", "teks"], ["Jenis", "Jenis", "teks"], ["Jam", "Jam", "jam"],
      ["Status Waktu", "Status Waktu", "status"], ["Selfie", "Foto Selfie", "link"],
      ["Jarak (m)", "Jarak (m)", "teks"], ["Keterangan", "Keterangan", "teks"]
    ],
    patroli: [
      ["Tanggal", "Tanggal", "teks"], ["Jam", "Jam", "jam"], ["Nama", "Nama", "teks"],
      ["Kegiatan", "Kegiatan", "teks"], ["Foto", "Foto", "link"], ["Lokasi", "Link Lokasi", "link"]
    ],
    izin: [
      ["Nama", "Nama", "teks"], ["Jenis", "Jenis", "teks"],
      ["Mulai", "Tanggal Mulai", "teks"], ["Selesai", "Tanggal Selesai", "teks"],
      ["Alasan", "Alasan", "teks"], ["Surat", "Foto Surat", "link"]
    ]
  };
  // Kunci tanggal untuk filter bulan per mode
  var KUNCI_BULAN = { absensi: "Tanggal Dinas", patroli: "Tanggal", izin: "Tanggal Mulai" };

  function cekKonfig() {
    if (API.belumDikonfigurasi()) {
      $("peringatan-konfig").innerHTML = '<div class="pesan peringatan">Server belum dikonfigurasi (Secret <code>APPS_SCRIPT_URL</code>).</div>';
      return true;
    }
    return false;
  }

  function muatDropdownPersonel() {
    API.post({ action: "listPersonel" }).then(function (r) {
      if (!r || r.status !== "success" || !r.personel) return;
      var opsi = '<option value="">Semua personel</option>';
      r.personel.forEach(function (p) { petaNama[p.id] = p.nama; opsi += '<option value="' + esc(p.id) + '">' + esc(p.nama) + '</option>'; });
      $("filterPersonel").innerHTML = opsi;
    }).catch(function () { /* abaikan */ });
  }

  function terapkanAkses() {
    ADMIN_PW = $("adminPass").value;
    muat();
  }

  function muat() {
    var btn = $("btnMuat"); setMuat(btn, true, "Memuat…");
    pesan($("pesan-rekap"), "", "");
    $("tbodyRekap").innerHTML = '<tr><td class="text-lembut">Memuat…</td></tr>';
    var payload = { action: ACTION[MODE] };
    if (ADMIN_PW) payload.adminPassword = ADMIN_PW;
    API.post(payload).then(function (r) {
      if (!r || r.status !== "success") { pesan($("pesan-rekap"), "error", (r && r.message) || "Gagal memuat data."); $("tbodyRekap").innerHTML = ""; return; }
      isAdmin = !!r.isAdmin;
      $("statusAkses").innerHTML = isAdmin ? '<span class="tanda-aktif">✓ Mode admin/operator (semua personel)</span>' : '<span class="text-lembut">Data perangkat ini saja</span>';
      if (ADMIN_PW && !isAdmin) pesan($("pesan-rekap"), "error", "Password admin/operator salah — menampilkan data perangkat ini saja.");
      tampil($("wadahFilterPersonel"), isAdmin);
      dataMentah = r.data || [];
      render();
    }).catch(function () { pesan($("pesan-rekap"), "error", ERR_JARINGAN); $("tbodyRekap").innerHTML = ""; })
      .then(function () { setMuat(btn, false); });
  }

  function render() {
    var bulan = $("filterBulan").value;
    var kb = KUNCI_BULAN[MODE];
    var idPersonel = isAdmin ? $("filterPersonel").value : "";
    dataTampil = dataMentah.filter(function (row) {
      if (bulan) { var v = String(row[kb] || "").substring(0, 7); if (v !== bulan) return false; }
      if (idPersonel) { if (String(row["ID Personel"]) !== idPersonel) return false; }
      return true;
    });

    var kolom = KOLOM[MODE];
    var thead = "<tr>";
    for (var i = 0; i < kolom.length; i++) thead += "<th>" + esc(kolom[i][0]) + "</th>";
    thead += "</tr>";
    $("theadRekap").innerHTML = thead;

    if (!dataTampil.length) {
      $("tbodyRekap").innerHTML = '<tr><td colspan="' + kolom.length + '" class="text-lembut text-tengah">Tidak ada data untuk filter ini.</td></tr>';
      $("jumlahBaris").textContent = "0 baris";
      return;
    }
    var html = "";
    for (var b = 0; b < dataTampil.length; b++) {
      var row = dataTampil[b];
      html += "<tr>";
      for (var c = 0; c < kolom.length; c++) html += "<td>" + sel(row, kolom[c]) + "</td>";
      html += "</tr>";
    }
    $("tbodyRekap").innerHTML = html;
    $("jumlahBaris").textContent = dataTampil.length + " baris";
  }

  function sel(row, kol) {
    var nilai = row[kol[1]];
    var tipe = kol[2];
    if (tipe === "shift") {
      if (!nilai || nilai === "-") return '<span class="badge s-off">-</span>';
      return '<span class="badge s-' + esc(nilai) + '">' + esc(nilai) + '</span>';
    }
    if (tipe === "status") {
      var s = String(nilai || "");
      if (s.indexOf("Terlambat") === 0 || s.indexOf("Pulang Cepat") === 0) return '<span class="badge-status badge-telat">' + esc(s) + '</span>';
      if (s) return '<span class="badge-status badge-ok">' + esc(s) + '</span>';
      return "";
    }
    if (tipe === "jam") return esc(String(nilai || "").substring(0, 8));
    if (tipe === "link") {
      if (!nilai) return '<span class="text-lembut">—</span>';
      return '<a href="' + esc(nilai) + '" target="_blank" rel="noopener">buka</a>';
    }
    return esc(nilai == null ? "" : nilai);
  }

  /* ---------- Ekspor CSV (BOM UTF-8, kolom lengkap sesuai HEADER_*) ---------- */
  function eksporCsv() {
    if (!dataTampil.length) { pesan($("pesan-rekap"), "info", "Tidak ada data untuk diekspor."); return; }
    // Ambil semua kunci dari baris pertama (urutan HEADER_* dari server).
    var keys = [];
    for (var k in dataTampil[0]) if (dataTampil[0].hasOwnProperty(k)) keys.push(k);
    var baris = [keys.map(kutip).join(",")];
    for (var i = 0; i < dataTampil.length; i++) {
      var row = dataTampil[i];
      var kolomBaris = [];
      for (var j = 0; j < keys.length; j++) kolomBaris.push(kutip(row[keys[j]]));
      baris.push(kolomBaris.join(","));
    }
    var isi = "﻿" + baris.join("\r\n"); // BOM agar Excel membaca UTF-8
    var nama = "rekap-" + MODE + "-" + ($("filterBulan").value || "semua") + ".csv";
    unduh(isi, nama);
  }
  function kutip(v) {
    var s = (v == null) ? "" : String(v);
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function unduh(isi, namaFile) {
    var blob = new Blob([isi], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = namaFile;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  function gantiMode(mode) {
    MODE = mode;
    var btns = document.querySelectorAll(".tab-btn");
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("aktif", btns[i].getAttribute("data-mode") === mode);
    $("infoFilter").innerHTML = (mode === "absensi")
      ? 'Absensi difilter berdasar <strong>Tanggal Dinas</strong>.'
      : (mode === "patroli" ? 'Patroli difilter berdasar tanggal kegiatan.' : 'Izin difilter berdasar tanggal mulai.');
    muat();
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (cekKonfig()) return;
    $("filterBulan").value = ymKini();
    muatDropdownPersonel();
    $("btnBuka").addEventListener("click", terapkanAkses);
    $("adminPass").addEventListener("keydown", function (e) { if (e.key === "Enter") terapkanAkses(); });
    $("btnMuat").addEventListener("click", muat);
    $("filterBulan").addEventListener("change", render);
    $("filterPersonel").addEventListener("change", render);
    $("btnCsv").addEventListener("click", eksporCsv);
    var btns = document.querySelectorAll(".tab-btn");
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener("click", function () { gantiMode(this.getAttribute("data-mode")); });
    muat();
  });

})();
