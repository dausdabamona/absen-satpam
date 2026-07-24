#!/usr/bin/env bash
# ============================================================
#  Deploy backend Apps Script (Code.gs) via clasp — satu alur:
#  push  ->  deploy/redeploy  ->  kelola deployment  ->  URL /exec
# ------------------------------------------------------------
#  Pakai:
#    bash scripts/deploy-gas.sh                 # push + BUAT deployment baru
#    bash scripts/deploy-gas.sh <deploymentId>  # push + PERBARUI deployment
#                                               #   (URL /exec tetap sama)
#
#  Prasyarat (sekali):
#    npm install               # memasang clasp (devDependency)
#    npm run gas:login         # login akun Google pemilik project
#    Aktifkan Apps Script API: https://script.google.com/home/usersettings (ON)
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."          # ke root repo (agar .clasp.json terbaca)

CLASP="npx clasp"
DEPLOY_ID="${1:-}"
DESC="Absen Satpam $(date '+%Y-%m-%d %H:%M')"

echo "==> [1/5] Cek login clasp"
if ! $CLASP show-authorized-user >/dev/null 2>&1; then
  echo "    Belum login. Jalankan dulu:  npm run gas:login"
  exit 1
fi
$CLASP show-authorized-user | sed 's/^/    /'

echo
echo "==> [2/5] Berkas yang akan di-push (harus HANYA Code.gs + appsscript.json)"
$CLASP status | sed 's/^/    /'

echo
echo "==> [3/5] Push Code.gs ke project"
$CLASP push -f

echo
if [ -n "$DEPLOY_ID" ]; then
  echo "==> [4/5] PERBARUI deployment $DEPLOY_ID (URL /exec tetap sama)"
  $CLASP redeploy "$DEPLOY_ID" -d "$DESC"
else
  echo "==> [4/5] BUAT deployment baru"
  $CLASP deploy -d "$DESC"
  echo "    (Simpan Deployment ID di atas untuk update berikutnya:"
  echo "     bash scripts/deploy-gas.sh <deploymentId>)"
fi

echo
echo "==> [5/5] Daftar semua deployment"
$CLASP deployments | sed 's/^/    /'

echo
echo "------------------------------------------------------------"
echo "URL backend = https://script.google.com/macros/s/<DeploymentID>/exec"
echo "  1) Buka URL /exec di browser. Harus tampil:"
echo '       {"status":"success","message":"API Absen Satpam aktif."}'
echo "     Jika muncul halaman login Google -> akses belum publik"
echo "     (pastikan appsscript.json: \"access\": \"ANYONE_ANONYMOUS\")."
echo "  2) Salin URL /exec ke GitHub Secret APPS_SCRIPT_URL, lalu"
echo "     jalankan ulang workflow Pages (Actions -> Run workflow)."
echo "------------------------------------------------------------"
