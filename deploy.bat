@echo off
setlocal
title Deploy Backend Absen Satpam

REM ============================================================
REM  Deploy backend Absen Satpam ke Google Apps Script
REM  Cara pakai: taruh file ini di folder proyek (yang ada
REM  .clasp.json), lalu dobel-klik atau jalankan: deploy.bat
REM  Ubah 2 baris SET di bawah bila ID deployment / branch beda.
REM ============================================================

set "DEPLOY_ID=AKfycbzLdo7MQtfyi4ji502o6UvSYZF0CwHgDiZNdzTpeLs1NcWt0ciZIYJR1nV3nkwZDQ5i"
set "BRANCH=claude/cek-6f7m12"

REM Pindah ke folder tempat deploy.bat ini berada
cd /d "%~dp0"

if not exist ".clasp.json" (
  echo [ERROR] File .clasp.json tidak ditemukan di folder ini.
  echo Letakkan deploy.bat di dalam folder proyek absen-satpam.
  echo.
  pause
  exit /b 1
)

echo ============================================================
echo   DEPLOY BACKEND ABSEN SATPAM
echo ============================================================
echo.

echo [1/3] Ambil kode terbaru dari GitHub...
git pull origin %BRANCH%
if errorlevel 1 goto gagal_git
echo.

echo [2/3] Unggah Code.gs ke Apps Script (clasp push)...
call clasp push -f
if errorlevel 1 goto gagal_push
echo.

echo [3/3] Buat versi baru deployment (clasp redeploy)...
call clasp redeploy %DEPLOY_ID% -d "update via deploy.bat"
if errorlevel 1 goto gagal_redeploy
echo.

echo ============================================================
echo   SELESAI - kode backend sudah di-deploy.
echo.
echo   CEK TERAKHIR (agar tidak "Gagal terhubung"):
echo   Editor Apps Script ^> Deploy ^> Manage deployments ^> Edit
echo     Execute as     : Me
echo     Who has access : Anyone
echo   lalu klik Deploy.
echo.
echo   Terakhir: REFRESH aplikasi (Ctrl+F5 / tutup-buka).
echo ============================================================
echo.
pause
exit /b 0

:gagal_git
echo.
echo [GAGAL] git pull bermasalah. Periksa koneksi internet atau konflik git.
echo.
pause
exit /b 1

:gagal_push
echo.
echo [GAGAL] clasp push bermasalah.
echo   - Jika "invalid_rapt" / reauth : jalankan  clasp logout  lalu  clasp login  lalu ulangi.
echo   - Jika "ENOTFOUND"             : internet putus, coba lagi.
echo.
pause
exit /b 1

:gagal_redeploy
echo.
echo [GAGAL] clasp redeploy bermasalah (sering karena jaringan sesaat).
echo Selesaikan manual di editor Apps Script:
echo   Deploy ^> Manage deployments ^> Edit ^> Version: New version ^> Deploy
echo   (sekalian set Who has access: Anyone)
echo.
pause
exit /b 1
