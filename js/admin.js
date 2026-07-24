/* ============================================================
   PANEL ADMIN — Absen Satpam (admin.html)
   Vanilla JS. Login email+password disimpan di sessionStorage.
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
  function normalWa(raw) {
    var d = String(raw || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.indexOf("62") === 0) return d;
    if (d.charAt(0) === "0") return "62" + d.slice(1);
    if (d.charAt(0) === "8") return "62" + d;
    return d;
  }
  function pesan(el, tipe, teks) { if (el) el.innerHTML = teks ? '<div class="pesan ' + tipe + '">' + esc(teks) + '</div>' : ""; }
  var ERR_JARINGAN = "Gagal terhubung. Periksa koneksi lalu coba lagi.";

  var NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  var NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  var KODE_SHIFT = ["-", "I", "II", "III", "IV", "V"];
  var SHIFT_MENIT = {
    "I": { mulai: 480, selesai: 960 }, "II": { mulai: 960, selesai: 1440 },
    "III": { mulai: 0, selesai: 480 }, "IV": { mulai: 0, selesai: 720 },
    "V": { mulai: 720, selesai: 1440 }
  };

  function sekarangWIT() {
    var now = new Date();
    var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (CONFIG.OFFSET_JAM * 3600000));
  }
  function ymdWIT(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function ymKini() { var d = sekarangWIT(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1); }
  function jumlahHariBulan(ym) { var p = ym.split("-"); return new Date(+p[0], +p[1], 0).getDate(); }
  function ymdKeDayNum(ymd) { var p = ymd.split("-").map(Number); return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000); }
  function menitAbsolut(ymd, menit) { return ymdKeDayNum(ymd) * 1440 + menit; }

  function setMuat(btn, muat, teks) {
    if (!btn) return;
    if (muat) { btn.dataset.teksAsli = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> ' + (teks || "Memproses…"); }
    else { btn.disabled = false; if (btn.dataset.teksAsli) btn.innerHTML = btn.dataset.teksAsli; }
  }

  /* ---------- Auth ---------- */
  function kredensial() {
    return { email: sessionStorage.getItem("satpam_admin_email") || "", password: sessionStorage.getItem("satpam_admin_pw") || "" };
  }
  function payloadAdmin(extra) {
    var k = kredensial(), o = { email: k.email, password: k.password };
    if (extra) for (var key in extra) if (extra.hasOwnProperty(key)) o[key] = extra[key];
    return o;
  }
  function postAdmin(action, extra) {
    var o = payloadAdmin(extra); o.action = action;
    return API.post(o);
  }

  /* Cache data */
  var CACHE = { personel: [], pengaturan: {}, jadwalBulan: null, jadwalData: null, tukar: [] };

  /* ============================================================
     LOGIN
     ============================================================ */
  function cekKonfig() {
    if (API.belumDikonfigurasi()) {
      var t = '<div class="pesan peringatan">Server (Apps Script URL) belum dikonfigurasi. Isi Secret <code>APPS_SCRIPT_URL</code> lalu deploy ulang.</div>';
      if ($("peringatan-konfig-login")) $("peringatan-konfig-login").innerHTML = t;
      if ($("peringatan-konfig")) $("peringatan-konfig").innerHTML = t;
      return true;
    }
    return false;
  }

  function login() {
    var email = $("loginEmail").value.trim();
    var pw = $("loginPass").value;
    if (!email || !pw) { pesan($("pesan-login"), "error", "Email dan password wajib diisi."); return; }
    var btn = $("btnLogin"); setMuat(btn, true, "Masuk…"); pesan($("pesan-login"), "", "");
    API.post({ action: "adminLogin", email: email, password: pw }).then(function (r) {
      if (r && r.status === "success") {
        sessionStorage.setItem("satpam_admin_email", email);
        sessionStorage.setItem("satpam_admin_pw", pw);
        localStorage.setItem("satpam_admin_device", "1");
        bukaAdmin();
      } else {
        pesan($("pesan-login"), "error", (r && r.message) || "Login gagal.");
      }
    }).catch(function () {
      pesan($("pesan-login"), "error",
        "Gagal terhubung ke server. Periksa koneksi internet. Bila internet normal, "
        + "pastikan Web App Apps Script sudah di-deploy dengan akses “Anyone / Siapa saja” "
        + "dan Secret APPS_SCRIPT_URL memakai URL /exec yang benar.");
    })
      .then(function () { setMuat(btn, false); });
  }

  function keluar() {
    sessionStorage.removeItem("satpam_admin_email");
    sessionStorage.removeItem("satpam_admin_pw");
    tampil($("layar-admin"), false);
    tampil($("layar-login"), true);
    $("loginPass").value = "";
  }

  function bukaAdmin() {
    tampil($("layar-login"), false);
    tampil($("layar-admin"), true);
    $("labelAdmin").textContent = kredensial().email;
    muatSemuaDasar();
    tampilkanSeksi("beranda");
  }

  /* Muat data dasar (personel + pengaturan) lalu isi form pengaturan & dropdown. */
  function muatSemuaDasar() {
    postAdmin("adminData").then(function (r) {
      if (!r || r.status !== "success") {
        if (r && r.message) { pesan($("pesan-beranda"), "error", r.message); if (String(r.message).toLowerCase().indexOf("password") !== -1) keluar(); }
        return;
      }
      CACHE.personel = r.personel || [];
      CACHE.pengaturan = r.pengaturan || {};
      CACHE.perangkat = r.perangkat || [];
      CACHE.operator = (r.operator !== undefined) ? r.operator : null;
      CACHE.isPrimary = (r.isPrimary !== undefined) ? r.isPrimary : undefined;
      isiFormPengaturan();
      isiDropdownTukar();
      renderPersonel();
      renderPerangkat();
      renderPendingBeranda();
      renderOperator();
    }).catch(function () { pesan($("pesan-beranda"), "error", ERR_JARINGAN); });
  }

  /* ============================================================
     NAVIGASI SEKSI
     ============================================================ */
  var JUDUL = { beranda: "Beranda", jadwal: "Jadwal Piket", tukar: "Tukar / Ganti Piket", personel: "Personel", perangkat: "Perangkat", pengaturan: "Pengaturan" };
  function tampilkanSeksi(sek) {
    var navs = document.querySelectorAll(".nav-link");
    for (var i = 0; i < navs.length; i++) navs[i].classList.toggle("aktif", navs[i].getAttribute("data-sek") === sek);
    var seks = document.querySelectorAll(".admin-seksi");
    for (var j = 0; j < seks.length; j++) seks[j].classList.toggle("aktif", seks[j].id === "sek-" + sek);
    $("judul-seksi").textContent = JUDUL[sek] || sek;
    if (sek === "beranda") muatBeranda();
    if (sek === "jadwal") { if (!CACHE.jadwalData) muatJadwal(); }
    if (sek === "tukar") muatTukar();
  }

  /* ============================================================
     BERANDA — status piket hari ini
     ============================================================ */
  function shiftEfektifDari(jadwalMap, tukarList, id, ymd) {
    var bulan = ymd.substring(0, 7);
    var idx = parseInt(ymd.substring(8, 10), 10) - 1;
    var kode = (jadwalMap[id] && jadwalMap[id][idx]) || "-";
    for (var i = 0; i < tukarList.length; i++) { if (tukarList[i].tanggal === ymd && tukarList[i].idAsal === id) kode = "-"; }
    for (var j = 0; j < tukarList.length; j++) { if (tukarList[j].tanggal === ymd && tukarList[j].idPengganti === id && SHIFT_MENIT[tukarList[j].shift]) kode = tukarList[j].shift; }
    return kode;
  }

  function muatBeranda() {
    var d = sekarangWIT(); var hariIni = ymdWIT(d);
    $("tglBeranda").textContent = NAMA_HARI[d.getDay()] + ", " + d.getDate() + " " + NAMA_BULAN[d.getMonth()] + " " + d.getFullYear();
    $("kpiHariIni").innerHTML = '<div class="text-lembut">Memuat…</div>';
    var bulan = hariIni.substring(0, 7);
    // Ambil jadwal bulan ini, tukar, dan rekap absensi hari ini secara paralel.
    var pJadwal = postAdmin("adminJadwal", { bulan: bulan });
    var pTukar = postAdmin("adminTukar");
    var pRekap = postAdmin("rekapAbsensi", { adminPassword: kredensial().password });
    Promise.all([pJadwal, pTukar, pRekap]).then(function (hasil) {
      var rj = hasil[0], rt = hasil[1], rr = hasil[2];
      if (!rj || rj.status !== "success") { $("kpiHariIni").innerHTML = '<div class="pesan error">Gagal memuat jadwal.</div>'; return; }
      var jadwalMap = {};
      (rj.baris || []).forEach(function (b) { jadwalMap[b.id] = b.shifts; });
      var tukarList = (rt && rt.data) ? rt.data : [];
      CACHE.tukar = tukarList;
      var absenHariIni = {};
      if (rr && rr.data) {
        rr.data.forEach(function (row) {
          var td = String(row["Tanggal Dinas"] || "").substring(0, 10);
          if (td !== hariIni) return;
          var id = String(row["ID Personel"]);
          if (!absenHariIni[id]) absenHariIni[id] = {};
          absenHariIni[id][row["Jenis"]] = { jam: String(row["Jam"] || "").substring(0, 5), status: String(row["Status Waktu"] || "") };
        });
      }
      var nowMin = d.getHours() * 60 + d.getMinutes();
      var nowAbs = menitAbsolut(hariIni, nowMin);
      var html = "";
      var ada = 0;
      (rj.baris || []).forEach(function (b) {
        var shift = shiftEfektifDari(jadwalMap, tukarList, b.id, hariIni);
        if (!shift || shift === "-") return;
        ada++;
        var def = SHIFT_MENIT[shift];
        var mulaiAbs = menitAbsolut(hariIni, def.mulai);
        var selesaiAbs = menitAbsolut(hariIni, def.selesai);
        var abs = absenHariIni[b.id] || {};
        var st, warna;
        if (abs["Masuk"] && abs["Pulang"]) {
          st = "✓ Selesai — Masuk " + abs["Masuk"].jam + ", Pulang " + abs["Pulang"].jam; warna = "badge-ok";
        } else if (abs["Masuk"]) {
          if (nowAbs < selesaiAbs) { st = "🟢 Bertugas — Masuk " + abs["Masuk"].jam; warna = "badge-info"; }
          else { st = "⚠ Belum absen Pulang — Masuk " + abs["Masuk"].jam; warna = "badge-telat"; }
        } else {
          if (nowAbs < mulaiAbs) { st = "Belum mulai (mulai " + jamDari(def.mulai) + ")"; warna = ""; }
          else { st = "⚠ Belum absen Masuk"; warna = "badge-telat"; }
        }
        var jamLabel = jamDari(def.mulai) + "–" + jamDari(def.selesai);
        html += '<div class="kpi-kartu"><div class="nama">' + esc(b.nama) + '</div>' +
          '<div class="baris"><span class="badge s-' + esc(shift) + '">Shift ' + esc(shift) + '</span>' +
          '<span class="stat">' + jamLabel + '</span></div>' +
          '<div class="baris"><span class="badge-status ' + warna + '">' + esc(st) + '</span></div></div>';
      });
      $("kpiHariIni").innerHTML = ada ? html : '<div class="pesan info">Tidak ada personel berjadwal piket hari ini.</div>';
    }).catch(function () { $("kpiHariIni").innerHTML = '<div class="pesan error">' + ERR_JARINGAN + '</div>'; });
  }
  function jamDari(menit) { menit = ((menit % 1440) + 1440) % 1440; return pad2(Math.floor(menit / 60)) + "." + pad2(menit % 60); }

  function renderPendingBeranda() {
    var pending = (CACHE.perangkat || []).filter(function (p) { return p.status === "pending"; });
    if (!pending.length) { $("pendingBeranda").innerHTML = '<p class="text-lembut">Tidak ada perangkat menunggu.</p>'; return; }
    var html = '<div class="tabel-bungkus"><table class="tabel"><thead><tr><th>Nama</th><th>Didaftarkan</th><th>Aksi</th></tr></thead><tbody>';
    pending.forEach(function (p) {
      html += '<tr><td>' + esc(p.nama) + '</td><td>' + esc(p.didaftarkan || "") + '</td>' +
        '<td class="aksi-sel"><button class="btn btn-primary btn-kecil" data-setuju="' + esc(p.deviceId) + '">Setujui</button>' +
        '<button class="btn btn-merah btn-kecil" data-blokir="' + esc(p.deviceId) + '">Blokir</button></td></tr>';
    });
    html += '</tbody></table></div>';
    $("pendingBeranda").innerHTML = html;
  }

  /* ============================================================
     JADWAL — grid orang × tanggal
     ============================================================ */
  function muatJadwal() {
    var bulan = $("bulanAdmin").value || ymKini();
    $("bulanAdmin").value = bulan;
    $("wadahGrid").innerHTML = '<p class="text-lembut" style="padding:16px;">Memuat…</p>';
    pesan($("pesan-jadwal-admin"), "", "");
    postAdmin("adminJadwal", { bulan: bulan }).then(function (r) {
      if (!r || r.status !== "success") { pesan($("pesan-jadwal-admin"), "error", (r && r.message) || "Gagal memuat."); $("wadahGrid").innerHTML = ""; return; }
      CACHE.jadwalBulan = bulan; CACHE.jadwalData = r.baris || [];
      renderGrid(bulan, r.baris || []);
    }).catch(function () { pesan($("pesan-jadwal-admin"), "error", ERR_JARINGAN); $("wadahGrid").innerHTML = ""; });
  }

  function renderGrid(bulan, baris) {
    var p = bulan.split("-"); var thn = +p[0], bln = +p[1];
    var hari = jumlahHariBulan(bulan);
    var html = '<table class="grid-jadwal"><thead><tr><th class="kol-nama">Personel</th>';
    for (var t = 1; t <= hari; t++) {
      var dow = new Date(thn, bln - 1, t).getDay();
      var wk = (dow === 0 || dow === 6) ? " th-akhir-pekan" : "";
      html += '<th class="' + wk + '">' + t + '</th>';
    }
    html += '</tr></thead><tbody>';
    baris.forEach(function (b) {
      html += '<tr data-id="' + esc(b.id) + '"><td class="kol-nama">' + esc(b.nama) + '</td>';
      for (var i = 0; i < hari; i++) {
        var kode = (b.shifts && b.shifts[i]) ? b.shifts[i] : "-";
        html += '<td class="' + selKelas(kode) + '">' + selectShift(kode, i) + '</td>';
      }
      html += '</tr>';
    });
    // Baris hitung penjaga per hari
    html += '<tr class="baris-hitung"><td class="kol-nama">Jumlah penjaga</td>';
    for (var h = 0; h < hari; h++) html += '<td data-hitung="' + h + '">0</td>';
    html += '</tr></tbody></table>';
    $("wadahGrid").innerHTML = html;
    hitungPenjaga();
    // Pasang listener perubahan sel
    var selects = $("wadahGrid").querySelectorAll("select.sel-shift");
    for (var s = 0; s < selects.length; s++) {
      selects[s].addEventListener("change", function () {
        var td = this.parentNode;
        td.className = selKelas(this.value);
        hitungPenjaga();
      });
    }
  }
  function selectShift(kode, idx) {
    var o = "";
    for (var i = 0; i < KODE_SHIFT.length; i++) {
      var k = KODE_SHIFT[i];
      o += '<option value="' + k + '"' + (k === kode ? " selected" : "") + '>' + (k === "-" ? "–" : k) + '</option>';
    }
    return '<select class="sel-shift" data-hari="' + idx + '">' + o + '</select>';
  }
  function selKelas(kode) {
    if (kode === "I") return "sel-I"; if (kode === "II") return "sel-II"; if (kode === "III") return "sel-III";
    if (kode === "IV") return "sel-IV"; if (kode === "V") return "sel-V"; return "sel-off";
  }
  function hitungPenjaga() {
    var rows = $("wadahGrid").querySelectorAll("tbody tr[data-id]");
    var hari = $("wadahGrid").querySelectorAll(".baris-hitung td[data-hitung]");
    var jml = [];
    for (var i = 0; i < hari.length; i++) jml[i] = 0;
    for (var r = 0; r < rows.length; r++) {
      var sel = rows[r].querySelectorAll("select.sel-shift");
      for (var c = 0; c < sel.length; c++) { if (sel[c].value && sel[c].value !== "-") jml[c]++; }
    }
    for (var k = 0; k < hari.length; k++) {
      hari[k].textContent = jml[k];
      hari[k].className = (jml[k] === 0) ? "kosong-bahaya" : "";
    }
  }
  function simpanJadwal() {
    if (!CACHE.jadwalBulan) { pesan($("pesan-jadwal-admin"), "error", "Muat jadwal dulu."); return; }
    var rows = $("wadahGrid").querySelectorAll("tbody tr[data-id]");
    var barisKirim = [];
    for (var r = 0; r < rows.length; r++) {
      var id = rows[r].getAttribute("data-id");
      var sel = rows[r].querySelectorAll("select.sel-shift");
      var shifts = [];
      for (var i = 0; i < 31; i++) shifts.push(sel[i] ? sel[i].value : "-");
      barisKirim.push({ id: id, shifts: shifts });
    }
    var btn = $("btnSimpanJadwal"); setMuat(btn, true, "Menyimpan…"); pesan($("pesan-jadwal-admin"), "", "");
    postAdmin("simpanJadwal", { bulan: CACHE.jadwalBulan, baris: barisKirim }).then(function (r) {
      if (r && r.status === "success") pesan($("pesan-jadwal-admin"), "sukses", r.message || "Jadwal tersimpan.");
      else pesan($("pesan-jadwal-admin"), "error", (r && r.message) || "Gagal menyimpan.");
    }).catch(function () { pesan($("pesan-jadwal-admin"), "error", ERR_JARINGAN); })
      .then(function () { setMuat(btn, false); });
  }
  function salinBulanSebelumnya() {
    if (!CACHE.jadwalBulan) { pesan($("pesan-jadwal-admin"), "error", "Muat jadwal dulu."); return; }
    var p = CACHE.jadwalBulan.split("-"); var thn = +p[0], bln = +p[1];
    var d = new Date(thn, bln - 2, 1); // bulan sebelumnya
    var bulanLalu = d.getFullYear() + "-" + pad2(d.getMonth() + 1);
    var btn = $("btnSalinBulan"); setMuat(btn, true, "Menyalin…");
    postAdmin("adminJadwal", { bulan: bulanLalu }).then(function (r) {
      if (!r || r.status !== "success") { pesan($("pesan-jadwal-admin"), "error", "Gagal memuat bulan " + bulanLalu + "."); return; }
      var mapLalu = {};
      (r.baris || []).forEach(function (b) { mapLalu[b.id] = b.shifts; });
      var rows = $("wadahGrid").querySelectorAll("tbody tr[data-id]");
      for (var i = 0; i < rows.length; i++) {
        var id = rows[i].getAttribute("data-id");
        var shifts = mapLalu[id] || [];
        var sel = rows[i].querySelectorAll("select.sel-shift");
        for (var j = 0; j < sel.length; j++) {
          var v = shifts[j] || "-";
          sel[j].value = (KODE_SHIFT.indexOf(v) !== -1) ? v : "-";
          sel[j].parentNode.className = selKelas(sel[j].value);
        }
      }
      hitungPenjaga();
      pesan($("pesan-jadwal-admin"), "info", "Jadwal " + bulanLalu + " disalin ke grid. Periksa lalu klik Simpan bila cocok.");
    }).catch(function () { pesan($("pesan-jadwal-admin"), "error", ERR_JARINGAN); })
      .then(function () { setMuat(btn, false); });
  }

  /* ============================================================
     TUKAR PIKET
     ============================================================ */
  function isiDropdownTukar() {
    var opsi = '<option value="">— pilih —</option>';
    (CACHE.personel || []).filter(function (p) { return p.aktif; }).forEach(function (p) {
      opsi += '<option value="' + esc(p.id) + '">' + esc(p.nama) + '</option>';
    });
    $("tukarAsal").innerHTML = opsi;
    $("tukarPengganti").innerHTML = opsi;
    if (!$("tukarTanggal").value) $("tukarTanggal").value = ymdWIT(sekarangWIT());
  }
  function muatTukar() {
    $("bodyTukar").innerHTML = '<tr><td colspan="6" class="text-lembut">Memuat…</td></tr>';
    postAdmin("adminTukar").then(function (r) {
      if (!r || r.status !== "success") { $("bodyTukar").innerHTML = '<tr><td colspan="6" class="pesan error">Gagal memuat.</td></tr>'; return; }
      CACHE.tukar = r.data || [];
      if (!r.data || !r.data.length) { $("bodyTukar").innerHTML = '<tr><td colspan="6" class="text-lembut">Belum ada catatan tukar piket.</td></tr>'; return; }
      var html = "";
      r.data.forEach(function (t) {
        html += '<tr><td>' + esc(t.tanggal) + '</td><td><span class="badge s-' + esc(t.shift) + '">' + esc(t.shift) + '</span></td>' +
          '<td>' + esc(t.namaAsal) + '</td><td>' + esc(t.namaPengganti) + '</td><td>' + esc(t.alasan || "") + '</td>' +
          '<td><button class="btn btn-merah btn-kecil" data-hapustukar="' + t.rowIndex + '">Hapus</button></td></tr>';
      });
      $("bodyTukar").innerHTML = html;
    }).catch(function () { $("bodyTukar").innerHTML = '<tr><td colspan="6" class="pesan error">' + ERR_JARINGAN + '</td></tr>'; });
  }
  function perbaruiShiftAsal() {
    var tgl = $("tukarTanggal").value, id = $("tukarAsal").value;
    var info = $("infoShiftAsal");
    if (!tgl || !id) { info.textContent = "Pilih tanggal & personel untuk melihat shift."; return; }
    var bulan = tgl.substring(0, 7);
    info.textContent = "Memeriksa shift…";
    postAdmin("adminJadwal", { bulan: bulan }).then(function (r) {
      if (!r || r.status !== "success") { info.textContent = "Gagal memeriksa jadwal."; return; }
      var idx = parseInt(tgl.substring(8, 10), 10) - 1;
      var brs = (r.baris || []).filter(function (b) { return b.id === id; })[0];
      var kode = (brs && brs.shifts && brs.shifts[idx]) ? brs.shifts[idx] : "-";
      if (!kode || kode === "-") info.innerHTML = '<span style="color:#dc2626;">Personel ini <strong>Off</strong> pada ' + esc(tgl) + ' menurut jadwal — tidak bisa ditukar.</span>';
      else info.innerHTML = 'Shift asal pada ' + esc(tgl) + ': <span class="badge s-' + esc(kode) + '">Shift ' + esc(kode) + '</span>';
    }).catch(function () { info.textContent = ERR_JARINGAN; });
  }
  function simpanTukar() {
    var tgl = $("tukarTanggal").value, asal = $("tukarAsal").value, pengganti = $("tukarPengganti").value;
    if (!tgl) { pesan($("pesan-tukar"), "error", "Tanggal wajib diisi."); return; }
    if (!asal || !pengganti) { pesan($("pesan-tukar"), "error", "Personel asal & pengganti wajib dipilih."); return; }
    if (asal === pengganti) { pesan($("pesan-tukar"), "error", "Asal & pengganti tidak boleh sama."); return; }
    var btn = $("btnSimpanTukar"); setMuat(btn, true, "Menyimpan…"); pesan($("pesan-tukar"), "", "");
    postAdmin("simpanTukar", {
      tanggal: tgl, idAsal: asal, idPengganti: pengganti,
      alasan: $("tukarAlasan").value, duaArah: $("tukarDuaArah").checked
    }).then(function (r) {
      if (r && r.status === "success") {
        pesan($("pesan-tukar"), "sukses", r.message || "Tercatat.");
        $("tukarAlasan").value = ""; $("tukarDuaArah").checked = false;
        muatTukar();
      } else pesan($("pesan-tukar"), "error", (r && r.message) || "Gagal.");
    }).catch(function () { pesan($("pesan-tukar"), "error", ERR_JARINGAN); })
      .then(function () { setMuat(btn, false); });
  }
  function hapusTukar(rowIndex) {
    if (!confirm("Hapus catatan tukar piket ini?")) return;
    postAdmin("hapusTukar", { rowIndex: rowIndex }).then(function (r) {
      if (r && r.status === "success") { pesan($("pesan-tukar"), "sukses", "Catatan dihapus."); muatTukar(); }
      else pesan($("pesan-tukar"), "error", (r && r.message) || "Gagal menghapus.");
    }).catch(function () { pesan($("pesan-tukar"), "error", ERR_JARINGAN); });
  }

  /* ============================================================
     PERSONEL
     ============================================================ */
  function renderPersonel() {
    var body = $("bodyPersonel");
    if (!CACHE.personel.length) { body.innerHTML = '<tr><td colspan="5" class="text-lembut">Belum ada personel.</td></tr>'; return; }
    var html = "";
    CACHE.personel.forEach(function (p) {
      html += '<tr><td>' + esc(p.id) + '</td><td>' + esc(p.nama) + '</td><td>' + esc(p.jabatan || "") + '</td>' +
        '<td>' + (p.aktif ? '<span class="tanda-aktif">Aktif</span>' : '<span class="tanda-nonaktif">Nonaktif</span>') + '</td>' +
        '<td class="aksi-sel"><button class="btn btn-abu btn-kecil" data-editpersonel="' + esc(p.id) + '">Edit</button>' +
        (p.aktif ? '<button class="btn btn-merah btn-kecil" data-nonaktif="' + esc(p.id) + '">Nonaktifkan</button>'
          : '<button class="btn btn-primary btn-kecil" data-aktifkan="' + esc(p.id) + '">Aktifkan</button>') + '</td></tr>';
    });
    body.innerHTML = html;
  }
  function formPersonel(p) {
    var isEdit = !!p;
    modalBuka(isEdit ? "Edit Personel" : "Tambah Personel",
      '<div class="form-grup"><label class="form-label">ID Personel</label><input type="text" id="mpId" value="' + esc(p ? p.id : "") + '" ' + (isEdit ? "readonly" : "") + ' placeholder="mis. P5"></div>' +
      '<div class="form-grup"><label class="form-label">Nama</label><input type="text" id="mpNama" value="' + esc(p ? p.nama : "") + '"></div>' +
      '<div class="form-grup"><label class="form-label">Jabatan</label><input type="text" id="mpJabatan" value="' + esc(p ? (p.jabatan || "Anggota") : "Anggota") + '"></div>',
      function () {
        var id = $("mpId").value.trim(), nama = $("mpNama").value.trim(), jabatan = $("mpJabatan").value.trim();
        if (!id || !nama) { alert("ID & nama wajib diisi."); return false; }
        modalMuat(true);
        postAdmin("simpanPersonel", { id: id, nama: nama, jabatan: jabatan, aktif: p ? p.aktif : true }).then(function (r) {
          if (r && r.status === "success") { modalTutup(); muatSemuaDasar(); pesan($("pesan-personel"), "sukses", "Data personel tersimpan."); }
          else { modalMuat(false); alert((r && r.message) || "Gagal menyimpan."); }
        }).catch(function () { modalMuat(false); alert(ERR_JARINGAN); });
        return false; // tutup diatur manual
      });
  }
  function setAktifPersonel(id, aktif) {
    var p = CACHE.personel.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (!aktif && !confirm("Nonaktifkan " + p.nama + "? Personel tidak akan muncul di jadwal & pendaftaran.")) return;
    postAdmin("simpanPersonel", { id: p.id, nama: p.nama, jabatan: p.jabatan, aktif: aktif }).then(function (r) {
      if (r && r.status === "success") { muatSemuaDasar(); pesan($("pesan-personel"), "sukses", "Status personel diperbarui."); }
      else pesan($("pesan-personel"), "error", (r && r.message) || "Gagal.");
    }).catch(function () { pesan($("pesan-personel"), "error", ERR_JARINGAN); });
  }

  /* ============================================================
     PERANGKAT
     ============================================================ */
  function renderPerangkat() {
    var body = $("bodyPerangkat");
    if (!CACHE.perangkat || !CACHE.perangkat.length) { body.innerHTML = '<tr><td colspan="6" class="text-lembut">Belum ada perangkat terdaftar.</td></tr>'; return; }
    var html = "";
    CACHE.perangkat.forEach(function (d) {
      var badge = d.status === "disetujui" ? '<span class="badge-status badge-ok">disetujui</span>'
        : d.status === "diblokir" ? '<span class="badge-status badge-telat">diblokir</span>'
        : '<span class="badge-status badge-info">pending</span>';
      var aksi = "";
      if (d.status !== "disetujui") aksi += '<button class="btn btn-primary btn-kecil" data-setuju="' + esc(d.deviceId) + '">Setujui</button>';
      if (d.status !== "diblokir") aksi += '<button class="btn btn-merah btn-kecil" data-blokir="' + esc(d.deviceId) + '">Blokir</button>';
      aksi += '<button class="btn btn-abu btn-kecil" data-hapusperangkat="' + esc(d.deviceId) + '">Hapus</button>';
      var waSel = d.noWa
        ? esc(d.noWa) + ' <a class="btn btn-primary btn-kecil" target="_blank" rel="noopener" href="https://wa.me/' + normalWa(d.noWa) + '">💬 Chat</a>'
        : '<span class="text-lembut">—</span>';
      html += '<tr><td>' + esc(d.nama) + '</td><td>' + esc(d.personelId) + '</td><td>' + badge + '</td><td class="text-kecil">' + esc(d.didaftarkan || "") + '</td><td class="text-kecil">' + waSel + '</td><td class="aksi-sel">' + aksi + '</td></tr>';
    });
    body.innerHTML = html;
  }
  function setStatusPerangkat(deviceId, statusBaru) {
    postAdmin("setStatusPerangkat", { deviceId: deviceId, statusBaru: statusBaru }).then(function (r) {
      if (r && r.status === "success") muatSemuaDasar();
      else alert((r && r.message) || "Gagal mengubah status.");
    }).catch(function () { alert(ERR_JARINGAN); });
  }
  function hapusPerangkat(deviceId) {
    if (!confirm("Hapus perangkat ini? Personel harus mendaftar ulang.")) return;
    postAdmin("hapusPerangkat", { deviceId: deviceId }).then(function (r) {
      if (r && r.status === "success") muatSemuaDasar();
      else alert((r && r.message) || "Gagal menghapus.");
    }).catch(function () { alert(ERR_JARINGAN); });
  }

  /* ============================================================
     OPERATOR (akun admin tambahan) — hanya admin utama
     ============================================================ */
  function renderOperator() {
    var kartu = $("kartuOperator");
    var kartuAkun = $("kartuAkunAdmin");
    // Backend belum diperbarui bila tak ada field operator → sembunyikan menu operator.
    var backendBaru = CACHE.operator !== null && CACHE.operator !== undefined;
    var primary = (CACHE.isPrimary === undefined) ? true : CACHE.isPrimary;
    if (kartuAkun) kartuAkun.style.display = primary ? "" : "none";
    if (kartu) kartu.style.display = (backendBaru && primary) ? "" : "none";
    if (!(backendBaru && primary)) return;
    var body = $("bodyOperator");
    if (!CACHE.operator.length) { body.innerHTML = '<tr><td colspan="4" class="text-lembut">Belum ada operator.</td></tr>'; return; }
    var html = "";
    CACHE.operator.forEach(function (o) {
      html += '<tr><td>' + esc(o.email) + '</td><td>' + esc(o.nama) + '</td>' +
        '<td>' + (o.aktif ? '<span class="tanda-aktif">Aktif</span>' : '<span class="tanda-nonaktif">Nonaktif</span>') + '</td>' +
        '<td class="aksi-sel"><button class="btn btn-merah btn-kecil" data-hapusoperator="' + esc(o.email) + '">Hapus</button></td></tr>';
    });
    body.innerHTML = html;
  }
  function tambahOperator() {
    var email = $("opEmail").value.trim();
    var nama = $("opNama").value.trim();
    var pass = $("opPass").value;
    if (!email) { pesan($("pesan-operator"), "error", "Email operator wajib diisi."); return; }
    var btn = $("btnTambahOperator"); setMuat(btn, true, "Menyimpan…"); pesan($("pesan-operator"), "", "");
    postAdmin("simpanOperator", { emailOperator: email, namaOperator: nama, passwordOperator: pass, aktifOperator: true }).then(function (r) {
      if (r && r.status === "success") {
        pesan($("pesan-operator"), "sukses", r.message || "Operator tersimpan.");
        $("opEmail").value = ""; $("opNama").value = ""; $("opPass").value = "";
        muatSemuaDasar();
      } else pesan($("pesan-operator"), "error", (r && r.message) || "Gagal menyimpan operator.");
    }).catch(function () { pesan($("pesan-operator"), "error", ERR_JARINGAN); })
      .then(function () { setMuat(btn, false); });
  }
  function hapusOperator(email) {
    if (!confirm("Hapus operator " + email + "?")) return;
    postAdmin("hapusOperator", { emailOperator: email }).then(function (r) {
      if (r && r.status === "success") { pesan($("pesan-operator"), "sukses", "Operator dihapus."); muatSemuaDasar(); }
      else pesan($("pesan-operator"), "error", (r && r.message) || "Gagal menghapus operator.");
    }).catch(function () { pesan($("pesan-operator"), "error", ERR_JARINGAN); });
  }

  /* ============================================================
     PENGATURAN
     ============================================================ */
  function isiFormPengaturan() {
    var s = CACHE.pengaturan || {};
    $("setLat").value = (s.lat === "" || s.lat == null) ? "" : s.lat;
    $("setLng").value = (s.lng === "" || s.lng == null) ? "" : s.lng;
    $("setRadius").value = s.radius || "";
    $("setAbaikanLokasi").checked = !!s.abaikanLokasi;
    $("setTolTelat").value = (s.tolTelat != null) ? s.tolTelat : 10;
    $("setTolCepat").value = (s.tolCepat != null) ? s.tolCepat : 5;
    $("setInstansi").value = s.namaInstansi || "";
    $("setKoordinator").value = s.namaKoordinator || "";
    $("setPengesah").value = s.namaPengesah || "";
    $("setJabatanPengesah").value = s.jabatanPengesah || "";
    $("setNoWaDarurat").value = s.noWaDarurat || "";
    $("setNoWaAdmin").value = s.noWaAdmin || "";
    $("setLinkGrupWa").value = s.linkGrupWa || "";
    $("setEmailAdmin").value = "";
    $("setPassBaru").value = "";
  }
  function gunakanLokasiSaya() {
    if (!navigator.geolocation) { alert("Perangkat tidak mendukung GPS."); return; }
    var btn = $("btnLokasiSaya"); setMuat(btn, true, "Mengambil…");
    navigator.geolocation.getCurrentPosition(function (pos) {
      setMuat(btn, false);
      $("setLat").value = pos.coords.latitude.toFixed(7);
      $("setLng").value = pos.coords.longitude.toFixed(7);
      if (!$("setRadius").value) $("setRadius").value = 100;
      pesan($("pesan-pengaturan"), "info", "Koordinat lokasi Anda diisi. Klik Simpan untuk menyimpan.");
    }, function () { setMuat(btn, false); alert("Gagal mengambil lokasi."); }, { enableHighAccuracy: true, timeout: 15000 });
  }
  function simpanPengaturan() {
    var pass = $("setPassBaru").value;
    if (pass && pass.length < 6) { pesan($("pesan-pengaturan"), "error", "Password baru minimal 6 karakter."); return; }
    var payload = {
      lat: $("setLat").value.trim(), lng: $("setLng").value.trim(), radius: $("setRadius").value.trim(),
      abaikanLokasi: $("setAbaikanLokasi").checked,
      tolTelat: $("setTolTelat").value, tolCepat: $("setTolCepat").value,
      namaInstansi: $("setInstansi").value.trim(),
      namaKoordinator: $("setKoordinator").value.trim(),
      namaPengesah: $("setPengesah").value.trim(),
      jabatanPengesah: $("setJabatanPengesah").value.trim(),
      noWaDarurat: $("setNoWaDarurat").value.trim(),
      noWaAdmin: $("setNoWaAdmin").value.trim(),
      linkGrupWa: $("setLinkGrupWa").value.trim()
    };
    if (pass) payload.passwordBaru = pass;
    var emailBaru = $("setEmailAdmin").value.trim();
    if (emailBaru) payload.emailAdminBaru = emailBaru;
    var btn = $("btnSimpanPengaturan"); setMuat(btn, true, "Menyimpan…"); pesan($("pesan-pengaturan"), "", "");
    postAdmin("simpanPengaturan", payload).then(function (r) {
      if (r && r.status === "success") {
        // Jika password/email diubah, perbarui sesi agar tetap login.
        if (pass) sessionStorage.setItem("satpam_admin_pw", pass);
        if (emailBaru) sessionStorage.setItem("satpam_admin_email", emailBaru);
        pesan($("pesan-pengaturan"), "sukses", r.message || "Tersimpan.");
        muatSemuaDasar();
        $("labelAdmin").textContent = kredensial().email;
      } else pesan($("pesan-pengaturan"), "error", (r && r.message) || "Gagal menyimpan.");
    }).catch(function () { pesan($("pesan-pengaturan"), "error", ERR_JARINGAN); })
      .then(function () { setMuat(btn, false); });
  }

  /* ============================================================
     MODAL
     ============================================================ */
  var modalCb = null;
  function modalBuka(judul, isiHtml, cb) {
    $("modalJudul").textContent = judul;
    $("modalIsi").innerHTML = isiHtml;
    modalCb = cb;
    setMuat($("modalOke"), false); $("modalOke").innerHTML = "Simpan";
    tampil($("modal"), true);
  }
  function modalTutup() { tampil($("modal"), false); modalCb = null; }
  function modalMuat(m) { setMuat($("modalOke"), m, "Menyimpan…"); $("modalBatal").disabled = m; }

  /* ============================================================
     EVENT DELEGATION & INIT
     ============================================================ */
  function pasangEvent() {
    $("btnLogin").addEventListener("click", login);
    $("loginPass").addEventListener("keydown", function (e) { if (e.key === "Enter") login(); });
    $("btnKeluar").addEventListener("click", keluar);

    var navs = document.querySelectorAll(".nav-link");
    for (var i = 0; i < navs.length; i++) navs[i].addEventListener("click", function () { tampilkanSeksi(this.getAttribute("data-sek")); });

    $("btnMuatBeranda").addEventListener("click", muatBeranda);
    $("btnMuatJadwal").addEventListener("click", muatJadwal);
    $("bulanAdmin").addEventListener("change", muatJadwal);
    $("btnSimpanJadwal").addEventListener("click", simpanJadwal);
    $("btnSalinBulan").addEventListener("click", salinBulanSebelumnya);

    $("tukarTanggal").addEventListener("change", perbaruiShiftAsal);
    $("tukarAsal").addEventListener("change", perbaruiShiftAsal);
    $("btnSimpanTukar").addEventListener("click", simpanTukar);
    $("btnTambahPersonel").addEventListener("click", function () { formPersonel(null); });
    $("btnLokasiSaya").addEventListener("click", gunakanLokasiSaya);
    $("btnSimpanPengaturan").addEventListener("click", simpanPengaturan);
    $("btnTambahOperator").addEventListener("click", tambahOperator);

    $("modalBatal").addEventListener("click", modalTutup);
    $("modalOke").addEventListener("click", function () { if (modalCb) modalCb(); });
    $("modal").addEventListener("click", function (e) { if (e.target === this) modalTutup(); });

    // Delegasi klik untuk tombol dinamis
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (t.getAttribute("data-setuju")) setStatusPerangkat(t.getAttribute("data-setuju"), "disetujui");
      else if (t.getAttribute("data-blokir")) setStatusPerangkat(t.getAttribute("data-blokir"), "diblokir");
      else if (t.getAttribute("data-hapusperangkat")) hapusPerangkat(t.getAttribute("data-hapusperangkat"));
      else if (t.getAttribute("data-hapustukar")) hapusTukar(parseInt(t.getAttribute("data-hapustukar"), 10));
      else if (t.getAttribute("data-editpersonel")) { var id = t.getAttribute("data-editpersonel"); formPersonel(CACHE.personel.filter(function (x) { return x.id === id; })[0]); }
      else if (t.getAttribute("data-nonaktif")) setAktifPersonel(t.getAttribute("data-nonaktif"), false);
      else if (t.getAttribute("data-aktifkan")) setAktifPersonel(t.getAttribute("data-aktifkan"), true);
      else if (t.getAttribute("data-hapusoperator")) hapusOperator(t.getAttribute("data-hapusoperator"));
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    cekKonfig();
    $("bulanAdmin").value = ymKini();
    pasangEvent();
    // Auto-login bila sesi masih ada
    var k = kredensial();
    if (k.email && k.password && !API.belumDikonfigurasi()) bukaAdmin();
    else tampil($("layar-login"), true);
  });

})();
