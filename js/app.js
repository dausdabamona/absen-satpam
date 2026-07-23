/* ============================================================
   APLIKASI ABSEN SATPAM — Halaman Personel (index.html)
   Vanilla JS, kompatibel Chrome Android lama.
   Identitas berbasis perangkat (tanpa login).
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Util ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function tampil(el, ya) { if (el) el.classList.toggle("tersembunyi", !ya); }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  var NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  var NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  /* Waktu WIT dari offset (bebas zona perangkat). */
  function sekarangWIT() {
    var now = new Date();
    var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (CONFIG.OFFSET_JAM * 3600000));
  }
  function ymdWIT(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }

  function setMuat(btn, muat, teks) {
    if (!btn) return;
    if (muat) {
      btn.dataset.teksAsli = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> ' + (teks || "Memproses…");
    } else {
      btn.disabled = false;
      if (btn.dataset.teksAsli) btn.innerHTML = btn.dataset.teksAsli;
    }
  }
  function pesan(el, tipe, teks) {
    if (!el) return;
    el.innerHTML = '<div class="pesan ' + tipe + '">' + esc(teks) + '</div>';
  }
  function pesanKosong(el) { if (el) el.innerHTML = ""; }

  var ERR_JARINGAN = "Gagal terhubung. Periksa koneksi lalu coba lagi.";

  /* Kompresi foto → dataURL JPEG. */
  function kompresFoto(file, maksLebar, kualitas, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        if (w > maksLebar) { h = Math.round(h * maksLebar / w); w = maksLebar; }
        var kanvas = document.createElement("canvas");
        kanvas.width = w; kanvas.height = h;
        kanvas.getContext("2d").drawImage(img, 0, 0, w, h);
        try { cb(kanvas.toDataURL("image/jpeg", kualitas)); }
        catch (err) { cb(e.target.result); }
      };
      img.onerror = function () { cb(null); };
      img.src = e.target.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  /* Ambil lokasi GPS → cb({lat,lng,akurasi}) atau cb(null, pesanError). */
  function ambilLokasi(cb) {
    if (!navigator.geolocation) { cb(null, "Perangkat tidak mendukung GPS."); return; }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        cb({ lat: pos.coords.latitude, lng: pos.coords.longitude, akurasi: Math.round(pos.coords.accuracy) });
      },
      function (err) {
        var m = "Gagal mengambil lokasi.";
        if (err && err.code === 1) m = "Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser.";
        else if (err && err.code === 3) m = "Pengambilan lokasi kehabisan waktu. Coba lagi di tempat terbuka.";
        cb(null, m);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  /* ---------- Status global ---------- */
  var lokasiAbsen = null, fotoAbsenData = null;
  var lokasiPatroli = null, fotoPatroliData = null;
  var fotoIzinData = null;
  var timerPatroli = null, patroliTerakhir = 0, tabAktif = "absen";

  /* ============================================================
     JAM DIGITAL
     ============================================================ */
  function mulaiJam() {
    $("labelZona").textContent = CONFIG.LABEL_ZONA;
    function tik() {
      var d = sekarangWIT();
      $("jamDigital").textContent = pad2(d.getHours()) + "." + pad2(d.getMinutes()) + "." + pad2(d.getSeconds());
      $("tanggalHari").textContent = NAMA_HARI[d.getDay()] + ", " + d.getDate() + " " + NAMA_BULAN[d.getMonth()] + " " + d.getFullYear();
    }
    tik();
    setInterval(tik, 1000);
  }

  /* ============================================================
     ALUR STATUS PERANGKAT
     ============================================================ */
  var semuaLayar = ["layar-loading", "layar-konfig", "layar-daftar", "layar-pending", "layar-blokir", "layar-utama"];
  function tampilkanLayar(id) {
    for (var i = 0; i < semuaLayar.length; i++) tampil($(semuaLayar[i]), semuaLayar[i] === id);
  }

  function mulai() {
    if (API.belumDikonfigurasi()) { tampilkanLayar("layar-konfig"); return; }
    tampilkanLayar("layar-loading");
    API.post({ action: "cekPerangkat" }).then(function (r) {
      if (!r || r.status !== "success") { tampilkanLayar("layar-daftar"); muatDaftarPersonel(); return; }
      if (!r.terdaftar) { tampilkanLayar("layar-daftar"); muatDaftarPersonel(); return; }
      if (r.deviceStatus === "disetujui") { bukaAplikasi(); return; }
      if (r.deviceStatus === "diblokir") { tampilkanLayar("layar-blokir"); return; }
      // pending
      $("pendingNama").textContent = r.nama || "-";
      tampilkanLayar("layar-pending");
    }).catch(function () {
      tampilkanLayar("layar-daftar"); muatDaftarPersonel();
      pesan($("pesan-daftar"), "error", ERR_JARINGAN);
    });
  }

  /* ---------- Pendaftaran ---------- */
  function muatDaftarPersonel() {
    var sel = $("pilihPersonel"), btn = $("btnDaftar");
    sel.innerHTML = '<option value="">— memuat daftar… —</option>';
    btn.disabled = true;
    API.post({ action: "listPersonel" }).then(function (r) {
      if (!r || r.status !== "success" || !r.personel) {
        sel.innerHTML = '<option value="">(gagal memuat)</option>';
        return;
      }
      var html = '<option value="">— pilih nama —</option>';
      for (var i = 0; i < r.personel.length; i++) {
        var p = r.personel[i];
        html += '<option value="' + esc(p.id) + '">' + esc(p.nama) + (p.jabatan ? " — " + esc(p.jabatan) : "") + '</option>';
      }
      sel.innerHTML = html;
    }).catch(function () {
      sel.innerHTML = '<option value="">(gagal memuat)</option>';
      pesan($("pesan-daftar"), "error", ERR_JARINGAN);
    });
  }

  function daftarkan() {
    var id = $("pilihPersonel").value;
    if (!id) { pesan($("pesan-daftar"), "error", "Pilih nama Anda terlebih dahulu."); return; }
    var btn = $("btnDaftar");
    setMuat(btn, true, "Mendaftar…");
    pesanKosong($("pesan-daftar"));
    API.post({ action: "daftarPerangkat", personelId: id }).then(function (r) {
      if (r && r.status === "success") {
        $("pendingNama").textContent = $("pilihPersonel").options[$("pilihPersonel").selectedIndex].text.split(" — ")[0];
        tampilkanLayar("layar-pending");
      } else {
        pesan($("pesan-daftar"), "error", (r && r.message) || "Pendaftaran gagal.");
      }
    }).catch(function () {
      pesan($("pesan-daftar"), "error", ERR_JARINGAN);
    }).then(function () { setMuat(btn, false); });
  }

  /* ============================================================
     APLIKASI UTAMA
     ============================================================ */
  function bukaAplikasi() {
    tampilkanLayar("layar-utama");
    pasangTab();
    pasangAbsen();
    pasangPatroli();
    pasangIzin();
    pasangJadwal();
    muatJadwalSaya();     // isi kartu Piket Saya
    muatRingkasan();      // ringkasan bulan berjalan
  }

  function pasangTab() {
    var btns = document.querySelectorAll(".tab-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        var tab = this.getAttribute("data-tab");
        tabAktif = tab;
        var b = document.querySelectorAll(".tab-btn");
        for (var j = 0; j < b.length; j++) b[j].classList.toggle("aktif", b[j] === this);
        var p = document.querySelectorAll(".tab-panel");
        for (var k = 0; k < p.length; k++) p[k].classList.toggle("aktif", p[k].id === "panel-" + tab);
        if (tab === "patroli") mulaiPengingatPatroli();
        if (tab === "jadwal") muatJadwalTab();
      });
    }
  }

  /* ---------- Kartu Piket Saya + tab Jadwal (jadwalSaya) ---------- */
  function labelPiket(shift, shiftDef) {
    if (!shift || shift === "-") return "Libur / Off";
    var jam = shiftDef && shiftDef[shift] ? shiftDef[shift] : (SHIFT_INFO[shift] ? SHIFT_INFO[shift].label : "");
    return "Shift " + shift + (jam ? " (" + jam + ")" : "");
  }
  function isiBarisPiket(el, shift, shiftDef) {
    if (!shift || shift === "-") {
      el.innerHTML = '<span class="badge s-off">Libur / Off</span>';
    } else {
      el.innerHTML = '<span class="badge s-' + esc(shift) + '">Shift ' + esc(shift) + '</span> ' +
        '<span style="opacity:.9;">' + esc(shiftDef && shiftDef[shift] ? shiftDef[shift] : "") + '</span>';
    }
  }

  function muatJadwalSaya() {
    API.post({ action: "jadwalSaya" }).then(function (r) {
      if (!r || r.status !== "success") return;
      if (r.hariIni) isiBarisPiket($("piketHariIni"), r.hariIni.shift, r.shiftDef);
      if (r.besok) isiBarisPiket($("piketBesok"), r.besok.shift, r.shiftDef);
    }).catch(function () { /* biarkan tanda — */ });
  }

  var jadwalTabSudah = false;
  function pasangJadwal() {
    var inp = $("bulanJadwal");
    var d = sekarangWIT();
    inp.value = d.getFullYear() + "-" + pad2(d.getMonth() + 1);
    inp.addEventListener("change", muatJadwalTab);
  }
  function muatJadwalTab() {
    var bulan = $("bulanJadwal").value;
    if (!/^\d{4}-\d{2}$/.test(bulan)) return;
    var ul = $("daftarJadwal");
    ul.innerHTML = '<li class="text-lembut">Memuat…</li>';
    pesanKosong($("pesan-jadwal"));
    API.post({ action: "jadwalSaya", bulan: bulan }).then(function (r) {
      if (!r || r.status !== "success") { pesan($("pesan-jadwal"), "error", (r && r.message) || "Gagal memuat jadwal."); ul.innerHTML = ""; return; }
      renderJadwalBulan(r);
    }).catch(function () { pesan($("pesan-jadwal"), "error", ERR_JARINGAN); ul.innerHTML = ""; });
  }
  function renderJadwalBulan(r) {
    var ul = $("daftarJadwal");
    var p = r.bulan.split("-"); var thn = +p[0], bln = +p[1];
    var jumlahHari = new Date(thn, bln, 0).getDate();
    var hariIniYmd = ymdWIT(sekarangWIT());
    $("judulJadwal").textContent = "Jadwal " + NAMA_BULAN[bln - 1] + " " + thn + (r.nama ? " — " + r.nama : "");
    var html = "";
    if (!r.shifts) {
      html = '<li class="text-lembut">Belum ada jadwal untuk bulan ini.</li>';
    } else {
      for (var i = 0; i < jumlahHari; i++) {
        var tgl = i + 1;
        var ymd = r.bulan + "-" + pad2(tgl);
        var shift = r.shifts[i] || "-";
        var hari = NAMA_HARI[new Date(thn, bln - 1, tgl).getDay()];
        var iniHari = ymd === hariIniYmd;
        var badge = (!shift || shift === "-")
          ? '<span class="badge s-off">Off</span>'
          : '<span class="badge s-' + esc(shift) + '">' + esc(shift) + '</span>';
        var jam = (shift && shift !== "-" && r.shiftDef && r.shiftDef[shift]) ? r.shiftDef[shift] : "Libur";
        html += '<li class="' + (iniHari ? "hari-ini" : "") + '">' +
          '<div class="jadwal-tgl"><span class="angka-tgl">' + tgl + '</span>' +
          '<span><div>' + esc(hari) + (iniHari ? ' <span class="badge-status badge-info">hari ini</span>' : '') + '</div>' +
          '<div class="jadwal-jam">' + esc(jam) + '</div></span></div>' +
          '<div>' + badge + '</div></li>';
      }
    }
    ul.innerHTML = html;
  }

  /* ---------- Tab Absen ---------- */
  function pasangAbsen() {
    $("fotoAbsen").addEventListener("change", function () {
      var f = this.files && this.files[0]; if (!f) return;
      pesanKosong($("pesan-absen"));
      kompresFoto(f, 800, 0.7, function (data) {
        if (!data) { pesan($("pesan-absen"), "error", "Gagal memproses foto. Coba lagi."); return; }
        fotoAbsenData = data;
        var img = $("previewAbsen"); img.src = data; img.classList.add("tampil");
        cekTombolAbsen();
      });
    });
    $("btnLokasiAbsen").addEventListener("click", function () {
      var btn = this; var info = $("infoLokasiAbsen");
      setMuat(btn, true, "Mengambil…"); info.className = "lokasi-info"; info.textContent = "Mengambil lokasi…";
      ambilLokasi(function (lok, err) {
        setMuat(btn, false);
        if (!lok) { lokasiAbsen = null; info.className = "lokasi-info"; info.textContent = err; cekTombolAbsen(); return; }
        lokasiAbsen = lok;
        info.className = "lokasi-info ok";
        info.textContent = "✓ Lokasi terekam (akurasi ±" + lok.akurasi + " m)";
        cekTombolAbsen();
      });
    });
    $("btnKirimAbsen").addEventListener("click", kirimAbsen);
  }
  function cekTombolAbsen() {
    var siap = !!fotoAbsenData && !!lokasiAbsen;
    tampil($("btnKirimAbsen"), siap);
    tampil($("hintAbsen"), !siap);
  }
  function kirimAbsen() {
    if (!fotoAbsenData || !lokasiAbsen) return;
    var btn = $("btnKirimAbsen");
    setMuat(btn, true, "Mengirim absen…");
    pesanKosong($("pesan-absen"));
    API.post({
      action: "absen",
      foto: fotoAbsenData,
      lat: lokasiAbsen.lat, lng: lokasiAbsen.lng, akurasi: lokasiAbsen.akurasi,
      keterangan: $("ketAbsen").value
    }).then(function (r) {
      if (r && r.status === "success") {
        pesan($("pesan-absen"), "sukses", r.message || "Absen berhasil.");
        // reset selfie agar tidak terkirim ulang
        fotoAbsenData = null; $("previewAbsen").classList.remove("tampil");
        $("fotoAbsen").value = ""; $("ketAbsen").value = "";
        cekTombolAbsen();
        muatRingkasan(); muatJadwalSaya();
      } else {
        pesan($("pesan-absen"), "error", (r && r.message) || "Absen gagal.");
      }
    }).catch(function () {
      pesan($("pesan-absen"), "error", ERR_JARINGAN);
    }).then(function () { setMuat(btn, false); cekTombolAbsen(); });
  }

  /* ---------- Ringkasan bulan berjalan (per Tanggal Dinas) ---------- */
  function muatRingkasan() {
    var d = sekarangWIT();
    var bulan = d.getFullYear() + "-" + pad2(d.getMonth() + 1);
    $("judulRingkas").textContent = "Ringkasan " + NAMA_BULAN[d.getMonth()] + " " + d.getFullYear();
    API.post({ action: "rekapAbsensi" }).then(function (r) {
      if (!r || r.status !== "success" || !r.data) return;
      var hadir = 0, telat = 0, cepat = 0;
      var terhitung = {}; // kunci: tanggalDinas|jenis (hindari duplikat)
      for (var i = 0; i < r.data.length; i++) {
        var row = r.data[i];
        var td = String(row["Tanggal Dinas"] || "").substring(0, 10);
        if (td.substring(0, 7) !== bulan) continue;
        var jenis = row["Jenis"];
        var kunci = td + "|" + jenis;
        if (terhitung[kunci]) continue;
        terhitung[kunci] = true;
        var status = String(row["Status Waktu"] || "");
        if (jenis === "Masuk") { hadir++; if (status.indexOf("Terlambat") === 0) telat++; }
        else if (jenis === "Pulang") { if (status.indexOf("Pulang Cepat") === 0) cepat++; }
      }
      $("rkHadir").textContent = hadir;
      $("rkTelat").textContent = telat;
      $("rkCepat").textContent = cepat;
    }).catch(function () { /* diamkan */ });
  }

  /* ---------- Tab Patroli ---------- */
  function pasangPatroli() {
    $("fotoPatroli").addEventListener("change", function () {
      var f = this.files && this.files[0]; if (!f) return;
      pesanKosong($("pesan-patroli"));
      kompresFoto(f, 1000, 0.7, function (data) {
        if (!data) { pesan($("pesan-patroli"), "error", "Gagal memproses foto."); return; }
        fotoPatroliData = data;
        var img = $("previewPatroli"); img.src = data; img.classList.add("tampil");
      });
    });
    $("btnLokasiPatroli").addEventListener("click", function () {
      var btn = this; var info = $("infoLokasiPatroli");
      setMuat(btn, true, "Mengambil…"); info.className = "lokasi-info"; info.textContent = "Mengambil lokasi…";
      ambilLokasi(function (lok, err) {
        setMuat(btn, false);
        if (!lok) { lokasiPatroli = null; info.textContent = err; return; }
        lokasiPatroli = lok;
        info.className = "lokasi-info ok";
        info.textContent = "✓ Lokasi terekam (±" + lok.akurasi + " m)";
      });
    });
    $("btnKirimPatroli").addEventListener("click", kirimPatroli);
  }
  function kirimPatroli() {
    var keg = $("kegPatroli").value.trim();
    if (!keg) { pesan($("pesan-patroli"), "error", "Deskripsi kegiatan wajib diisi."); return; }
    if (!fotoPatroliData) { pesan($("pesan-patroli"), "error", "Foto wajib diambil."); return; }
    var btn = $("btnKirimPatroli");
    setMuat(btn, true, "Mengirim…");
    pesanKosong($("pesan-patroli"));
    var payload = { action: "patroli", kegiatan: keg, foto: fotoPatroliData };
    if (lokasiPatroli) { payload.lat = lokasiPatroli.lat; payload.lng = lokasiPatroli.lng; }
    API.post(payload).then(function (r) {
      if (r && r.status === "success") {
        pesan($("pesan-patroli"), "sukses", r.message || "Jurnal patroli tersimpan.");
        $("kegPatroli").value = ""; fotoPatroliData = null;
        $("previewPatroli").classList.remove("tampil"); $("fotoPatroli").value = "";
        lokasiPatroli = null; $("infoLokasiPatroli").className = "lokasi-info"; $("infoLokasiPatroli").textContent = "Lokasi belum diambil.";
        tandaiPatroliTerisi();
      } else {
        pesan($("pesan-patroli"), "error", (r && r.message) || "Gagal menyimpan patroli.");
      }
    }).catch(function () {
      pesan($("pesan-patroli"), "error", ERR_JARINGAN);
    }).then(function () { setMuat(btn, false); });
  }

  /* Pengingat patroli tiap INTERVAL_PATROLI_MENIT selama tab aktif. */
  function mulaiPengingatPatroli() {
    if (patroliTerakhir === 0) patroliTerakhir = Date.now();
    if (window.Notification && Notification.permission === "default") {
      try { Notification.requestPermission(); } catch (e) { /* abaikan */ }
    }
    if (timerPatroli) return;
    timerPatroli = setInterval(cekPengingatPatroli, 30000); // cek tiap 30 dtk
  }
  function cekPengingatPatroli() {
    var jeda = (CONFIG.INTERVAL_PATROLI_MENIT || 120) * 60000;
    if (Date.now() - patroliTerakhir >= jeda) {
      $("bannerPatroli").classList.remove("tersembunyi");
      if (tabAktif !== "patroli" || document.hidden) beriNotifikasiPatroli();
    }
  }
  function beriNotifikasiPatroli() {
    try {
      if (window.Notification && Notification.permission === "granted") {
        new Notification("Waktunya Patroli 🔦", { body: "Sudah 2 jam. Isi jurnal patroli berfoto." });
      }
    } catch (e) { /* abaikan */ }
    bunyiBeep();
  }
  function bunyiBeep() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = new AC();
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 400);
    } catch (e) { /* abaikan */ }
  }
  function tandaiPatroliTerisi() {
    patroliTerakhir = Date.now();
    $("bannerPatroli").classList.add("tersembunyi");
  }

  /* ---------- Tab Izin ---------- */
  function pasangIzin() {
    var d = sekarangWIT();
    var hariIni = ymdWIT(d);
    $("tglMulaiIzin").value = hariIni;
    $("tglSelesaiIzin").value = hariIni;
    $("fotoIzin").addEventListener("change", function () {
      var f = this.files && this.files[0]; if (!f) return;
      pesanKosong($("pesan-izin"));
      kompresFoto(f, 1000, 0.7, function (data) {
        if (!data) { pesan($("pesan-izin"), "error", "Gagal memproses foto."); return; }
        fotoIzinData = data;
        var img = $("previewIzin"); img.src = data; img.classList.add("tampil");
      });
    });
    $("btnKirimIzin").addEventListener("click", kirimIzin);
  }
  function kirimIzin() {
    var jenis = $("jenisIzin").value;
    var mulai = $("tglMulaiIzin").value;
    var selesai = $("tglSelesaiIzin").value || mulai;
    var alasan = $("alasanIzin").value.trim();
    if (!mulai) { pesan($("pesan-izin"), "error", "Tanggal mulai wajib diisi."); return; }
    if (selesai && selesai < mulai) { pesan($("pesan-izin"), "error", "Tanggal selesai tidak boleh sebelum tanggal mulai."); return; }
    if (!alasan) { pesan($("pesan-izin"), "error", "Alasan wajib diisi."); return; }
    if (!fotoIzinData) { pesan($("pesan-izin"), "error", "Foto surat/bukti wajib dilampirkan."); return; }
    var btn = $("btnKirimIzin");
    setMuat(btn, true, "Mengirim…");
    pesanKosong($("pesan-izin"));
    API.post({
      action: "izin", jenis: jenis, tglMulai: mulai, tglSelesai: selesai,
      alasan: alasan, foto: fotoIzinData
    }).then(function (r) {
      if (r && r.status === "success") {
        pesan($("pesan-izin"), "sukses", r.message || "Pengajuan terkirim.");
        $("alasanIzin").value = ""; fotoIzinData = null;
        $("previewIzin").classList.remove("tampil"); $("fotoIzin").value = "";
      } else {
        pesan($("pesan-izin"), "error", (r && r.message) || "Pengajuan gagal.");
      }
    }).catch(function () {
      pesan($("pesan-izin"), "error", ERR_JARINGAN);
    }).then(function () { setMuat(btn, false); });
  }

  /* ============================================================
     REDIRECT desktop / admin → admin.html
     ============================================================ */
  function perangkatDesktop() {
    var lebar = window.innerWidth || document.documentElement.clientWidth || 0;
    var adaSentuh = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    return lebar >= 1024 && !adaSentuh;
  }
  function cekRedirect() {
    var params = window.location.search;
    if (params.indexOf("absen=1") !== -1) return false; // dipaksa ke halaman absen
    var pernahAdmin = localStorage.getItem("satpam_admin_device") === "1";
    if (pernahAdmin || perangkatDesktop()) { window.location.href = "admin.html"; return true; }
    return false;
  }

  /* ============================================================
     INISIALISASI
     ============================================================ */
  document.addEventListener("DOMContentLoaded", function () {
    if (cekRedirect()) return;
    mulaiJam();
    $("btnDaftar").addEventListener("click", daftarkan);
    $("pilihPersonel").addEventListener("change", function () { $("btnDaftar").disabled = !this.value; });
    $("btnCekUlang").addEventListener("click", mulai);
    mulai();
  });

})();
