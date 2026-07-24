/* ============================================================
   KONFIGURASI APLIKASI ABSEN SATPAM (PIKET POS)
   ------------------------------------------------------------
   URL backend TIDAK disimpan di sini (rahasia). Nilai
   "__APPS_SCRIPT_URL__" adalah placeholder yang otomatis diganti
   GitHub Actions saat deploy, dari Secret APPS_SCRIPT_URL.
   Tanpa login: identitas menempel pada perangkat (HP) ini.
   ============================================================ */

const CONFIG = {
  APPS_SCRIPT_URL: "__APPS_SCRIPT_URL__",

  OFFSET_JAM: 9,
  LABEL_ZONA: "WIT",

  // Pengingat jurnal patroli (menit). 120 = setiap 2 jam.
  INTERVAL_PATROLI_MENIT: 120,

  // Fallback kontak darurat bila backend & cache kosong (mis. saat baru pertama
  // buka & server tak terjangkau). Repo publik — JANGAN taruh nomor pribadi
  // sensitif; kosongkan atau isi nomor pos/koordinator umum saja.
  NO_WA_DARURAT_FALLBACK: "",   // mis. "6281234567890"
  LINK_GRUP_WA_FALLBACK: ""     // mis. "https://chat.whatsapp.com/xxxxxxxx"
};

/* Definisi shift — HARUS sama dgn SHIFT_DEF di Code.gs */
const SHIFT_INFO = {
  "I":   { label: "08.00-16.00", nama: "Shift I (Pagi)" },
  "II":  { label: "16.00-24.00", nama: "Shift II (Malam)" },
  "III": { label: "00.00-08.00", nama: "Shift III (Dini Hari)" },
  "IV":  { label: "00.00-12.00", nama: "Shift IV (12 jam pagi)" },
  "V":   { label: "12.00-24.00", nama: "Shift V (12 jam malam)" },
  "-":   { label: "Libur/Off",   nama: "Off" }
};

/* ---------- ID Perangkat (dibuat sekali, disimpan lokal) ---------- */
function getDeviceId() {
  let id = localStorage.getItem("satpam_device_id");
  if (!id) {
    id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : "dev-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    localStorage.setItem("satpam_device_id", id);
  }
  return id;
}

/* ---------- API ---------- */
const API = {
  belumDikonfigurasi: function () {
    var u = CONFIG.APPS_SCRIPT_URL;
    return !u || u.indexOf("http") !== 0;
  },
  post: function (payload) {
    if (payload.deviceId === undefined) payload.deviceId = getDeviceId();
    return fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }
};
