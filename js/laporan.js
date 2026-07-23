/* ============================================================
   DAFTAR HADIR BULANAN — Absen Satpam (laporan.html)
   Dokumen pertanggungjawaban pembayaran, cetak A4 landscape.
   ============================================================ */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function pesan(el, tipe, teks) { if (el) el.innerHTML = teks ? '<div class="pesan ' + tipe + '">' + esc(teks) + '</div>' : ""; }
  var ERR_JARINGAN = "Gagal terhubung. Periksa koneksi lalu coba lagi.";

  var NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  var SHIFT_VALID = { "I": 1, "II": 1, "III": 1, "IV": 1, "V": 1 };
  var IZIN_KODE = { "Izin": "I", "Sakit": "S", "Cuti": "C", "Dinas Luar": "DL", "Lainnya": "L" };

  function sekarangWIT() {
    var now = new Date();
    var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (CONFIG.OFFSET_JAM * 3600000));
  }
  function ymdWIT(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function ymKini() { var d = sekarangWIT(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1); }
  function jumlahHariBulan(ym) { var p = ym.split("-"); return new Date(+p[0], +p[1], 0).getDate(); }
  function setMuat(btn, muat, teks) {
    if (!btn) return;
    if (muat) { btn.dataset.teksAsli = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> ' + (teks || "…"); }
    else { btn.disabled = false; if (btn.dataset.teksAsli) btn.innerHTML = btn.dataset.teksAsli; }
  }

  function cekKonfig() {
    if (API.belumDikonfigurasi()) {
      $("peringatan-konfig").innerHTML = '<div class="pesan peringatan">Server belum dikonfigurasi (Secret <code>APPS_SCRIPT_URL</code>).</div>';
      return true;
    }
    return false;
  }

  /* Shift efektif = grid + koreksi tukar. */
  function shiftEfektif(shiftsGrid, tukarList, id, ymd) {
    var idx = parseInt(ymd.substring(8, 10), 10) - 1;
    var kode = (shiftsGrid && shiftsGrid[idx]) ? shiftsGrid[idx] : "-";
    for (var i = 0; i < tukarList.length; i++) { if (tukarList[i].tanggal === ymd && tukarList[i].idAsal === id) kode = "-"; }
    for (var j = 0; j < tukarList.length; j++) { if (tukarList[j].tanggal === ymd && tukarList[j].idPengganti === id && SHIFT_VALID[tukarList[j].shift]) kode = tukarList[j].shift; }
    return kode;
  }

  function tampilkan() {
    var email = $("lapEmail").value.trim();
    var pw = $("lapPass").value;
    var bulan = $("lapBulan").value;
    if (!email || !pw) { pesan($("pesan-laporan"), "error", "Email & password admin wajib diisi."); return; }
    if (!/^\d{4}-\d{2}$/.test(bulan)) { pesan($("pesan-laporan"), "error", "Pilih bulan."); return; }
    var btn = $("btnTampilkan"); setMuat(btn, true, "Memuat…"); pesan($("pesan-laporan"), "", "");
    API.post({ action: "dataLaporan", email: email, password: pw, bulan: bulan }).then(function (r) {
      if (!r || r.status !== "success") { pesan($("pesan-laporan"), "error", (r && r.message) || "Gagal memuat laporan."); return; }
      // Simpan sesi agar konsisten dengan panel admin
      sessionStorage.setItem("satpam_admin_email", email);
      sessionStorage.setItem("satpam_admin_pw", pw);
      render(r);
      $("lapHalaman").style.display = "block";
      $("btnCetak").disabled = false;
      pesan($("pesan-laporan"), "sukses", "Laporan siap. Periksa lalu klik Cetak.");
    }).catch(function () { pesan($("pesan-laporan"), "error", ERR_JARINGAN); })
      .then(function () { setMuat(btn, false); });
  }

  function render(r) {
    var bulan = r.bulan;
    var p = bulan.split("-"); var thn = +p[0], bln = +p[1];
    var hari = jumlahHariBulan(bulan);
    var hariIni = ymdWIT(sekarangWIT());
    var tukar = r.tukar || [];

    // Peta absen: id -> tanggalDinas -> {Masuk:{status}, Pulang:{status}}
    var petaAbsen = {};
    (r.absen || []).forEach(function (a) {
      var id = String(a.id), td = String(a.tanggalDinas).substring(0, 10);
      if (!petaAbsen[id]) petaAbsen[id] = {};
      if (!petaAbsen[id][td]) petaAbsen[id][td] = {};
      petaAbsen[id][td][a.jenis] = { status: String(a.status || "") };
    });
    // Peta izin: id -> [{mulai,selesai,jenis}]
    var petaIzin = {};
    (r.izin || []).forEach(function (z) {
      var id = String(z.id);
      if (!petaIzin[id]) petaIzin[id] = [];
      petaIzin[id].push({ mulai: String(z.mulai).substring(0, 10), selesai: String(z.selesai || z.mulai).substring(0, 10), jenis: z.jenis });
    });
    function izinPada(id, ymd) {
      var arr = petaIzin[id] || [];
      for (var i = 0; i < arr.length; i++) { if (ymd >= arr[i].mulai && ymd <= arr[i].selesai) return arr[i].jenis; }
      return null;
    }

    // Kop
    $("lapInstansi").textContent = r.namaInstansi || "Politeknik Kelautan dan Perikanan Sorong";
    $("lapBulanLabel").textContent = "Bulan: " + NAMA_BULAN[bln - 1] + " " + thn;

    // Header tabel
    var thead = '<thead><tr><th class="kol-no">No</th><th class="kol-nama">Nama</th>';
    for (var t = 1; t <= hari; t++) thead += '<th>' + t + '</th>';
    thead += '<th class="kol-ringkas">Jdw</th><th class="kol-ringkas">Hdr</th><th class="kol-ringkas">Tlt</th><th class="kol-ringkas">PC</th><th class="kol-ringkas">Mkr</th><th class="kol-ringkas">Izn</th></tr></thead>';

    var tbody = '<tbody>';
    (r.personel || []).forEach(function (per, no) {
      var id = String(per.id);
      var s = { jdw: 0, hadir: 0, telat: 0, cepat: 0, mangkir: 0, izin: 0 };
      var sel = "";
      for (var d = 1; d <= hari; d++) {
        var ymd = bulan + "-" + pad2(d);
        var shift = shiftEfektif(per.shifts, tukar, id, ymd);
        var c = hitungSel(shift, petaAbsen[id] && petaAbsen[id][ymd], izinPada(id, ymd), ymd, hariIni, s);
        sel += '<td class="' + c.kelas + '">' + c.isi + '</td>';
      }
      tbody += '<tr><td class="kol-no">' + (no + 1) + '</td><td class="kol-nama">' + esc(per.nama) + '</td>' + sel +
        '<td class="kol-ringkas">' + s.jdw + '</td><td class="kol-ringkas">' + s.hadir + '</td>' +
        '<td class="kol-ringkas">' + s.telat + '</td><td class="kol-ringkas">' + s.cepat + '</td>' +
        '<td class="kol-ringkas">' + s.mangkir + '</td><td class="kol-ringkas">' + s.izin + '</td></tr>';
    });
    tbody += '</tbody>';
    $("lapGrid").innerHTML = thead + tbody;

    // Tanda tangan
    var dc = sekarangWIT();
    $("lapTempatTgl").textContent = "Sorong, " + dc.getDate() + " " + NAMA_BULAN[dc.getMonth()] + " " + dc.getFullYear();
    $("lapKoordinator").textContent = r.namaKoordinator || "—";
    $("lapJabatanPengesah").textContent = r.jabatanPengesah || "Mengetahui";
    $("lapPengesah").textContent = r.namaPengesah || "—";
  }

  /* Tentukan isi & kelas sel + akumulasi ringkasan. */
  function hitungSel(shift, absen, izinJenis, ymd, hariIni, s) {
    if (!shift || shift === "-") return { kelas: "lap-off", isi: "-" };
    s.jdw++;
    var punyaMasuk = absen && absen["Masuk"];
    var punyaPulang = absen && absen["Pulang"];

    if (punyaMasuk || punyaPulang) {
      if (punyaMasuk && String(absen["Masuk"].status).indexOf("Terlambat") === 0) s.telat++;
      if (punyaPulang && String(absen["Pulang"].status).indexOf("Pulang Cepat") === 0) s.cepat++;
      if (punyaMasuk && punyaPulang) {
        s.hadir++;
        var mark = "";
        if (String(absen["Masuk"].status).indexOf("Terlambat") === 0 || String(absen["Pulang"].status).indexOf("Pulang Cepat") === 0) mark = '<span class="status-mini">×</span>';
        return { kelas: "lap-hadir", isi: esc(shift) + '<span class="status-mini">✓</span>' + mark };
      }
      // hanya salah satu
      return { kelas: "lap-parsial", isi: esc(shift) + '<span class="status-mini">∆</span>' };
    }

    // Tidak ada absen sama sekali
    if (izinJenis) { s.izin++; return { kelas: "lap-izin", isi: (IZIN_KODE[izinJenis] || "I") }; }
    if (ymd < hariIni) { s.mangkir++; return { kelas: "lap-mangkir", isi: '<span class="status-mini" style="font-size:11px;">X</span>' + esc(shift) }; }
    // Belum terjadi (hari ini atau mendatang)
    return { kelas: "lap-depan", isi: esc(shift) };
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (cekKonfig()) return;
    $("lapBulan").value = ymKini();
    // Prefill dari sesi admin bila ada
    var em = sessionStorage.getItem("satpam_admin_email");
    var pw = sessionStorage.getItem("satpam_admin_pw");
    if (em) $("lapEmail").value = em;
    if (pw) $("lapPass").value = pw;
    $("btnTampilkan").addEventListener("click", tampilkan);
    $("btnCetak").addEventListener("click", function () { window.print(); });
  });

})();
