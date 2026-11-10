@echo off
setlocal
cd /d "%~dp0"
title UniLost v2.9.4 - Cloud preparation - Step 1
echo =========================================================
echo  UniLost v2.9.4 - Prepare source for cloud deployment
 echo  Folder: %CD%
echo =========================================================
echo.
where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Windows PowerShell was not found.
  pause
  exit /b 1
)
set "UNILOST_BATCH_PATH=%~f0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$p=[IO.File]::ReadAllText($env:UNILOST_BATCH_PATH,[Text.Encoding]::UTF8); $m=[regex]::Match($p,'(?m)^# POWERSHELL_START\r?\n'); if(-not $m.Success){throw 'Embedded PowerShell section missing'}; & ([scriptblock]::Create($p.Substring($m.Index+$m.Length)))"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" (echo [FAILED] No Git push or deployment was attempted.) else (echo [DONE] Review CLOUD_SETUP_STEP1.md before uploading to GitHub.)
echo.
pause
exit /b %RESULT%
# POWERSHELL_START
$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$required = @('backend/src/server.js','backend/src/app.js','frontend/src/api.js','backend/package.json','frontend/package.json')
foreach ($file in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $file) -PathType Leaf)) {
    throw "Not the extracted UniLost v2.9.4 root. Missing: $file. Place BAT next to backend and frontend folders."
  }
}
$version = (Get-Content -LiteralPath (Join-Path $root 'backend/package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($version -ne '2.9.4') { throw "Expected UniLost v2.9.4, found $version. Nothing changed." }

$utf8 = New-Object System.Text.UTF8Encoding($false)
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backup = Join-Path $root ('.cloud_step1_backup_' + $stamp)
$modified = New-Object System.Collections.Generic.List[string]
$created = New-Object System.Collections.Generic.List[string]
function Save-Text([string]$rel,[string]$body,[bool]$createOnly=$false) {
  $target = Join-Path $root ($rel.Replace('/',[IO.Path]::DirectorySeparatorChar))
  $exists = Test-Path -LiteralPath $target -PathType Leaf
  if ($createOnly -and $exists) { Write-Host "[SKIP] Already exists: $rel"; return }
  if ($exists) {
    $old = [IO.File]::ReadAllText($target)
    if ($old -ceq $body) { Write-Host "[OK] Already configured: $rel"; return }
    $saved = Join-Path $backup ($rel.Replace('/',[IO.Path]::DirectorySeparatorChar))
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($saved)) | Out-Null
    [IO.File]::Copy($target,$saved,$true)
    $modified.Add($rel)
  } else { $created.Add($rel) }
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
  [IO.File]::WriteAllText($target,$body,$utf8)
  Write-Host "[WRITE] $rel"
}
function Replace-Once([string]$rel,[string]$needle,[string]$replacement) {
  $target=Join-Path $root ($rel.Replace('/',[IO.Path]::DirectorySeparatorChar))
  $old=[IO.File]::ReadAllText($target)
  if ($old.Contains($replacement)) { Write-Host "[OK] Already patched: $rel"; return }
  $hits=$old.Split(@($needle),[StringSplitOptions]::None).Length-1
  if ($hits -ne 1) { throw "Cannot safely patch $rel (expected one exact match, found $hits). No replacement made for this file." }
  Save-Text $rel ($old.Replace($needle,$replacement))
}

try {
  Write-Host '[1/7] Backend listen address'
  $listenReplacement = @'
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
  app.listen(port, host, () => console.log(`UniLost API running on ${host}:${port}`));
'@
  Replace-Once 'backend/src/server.js' "app.listen(port, '127.0.0.1', () => console.log(``UniLost API running at http://localhost:`${port}``));" ($listenReplacement.TrimEnd("`r","`n"))

  Write-Host '[2/7] Avoid replaying destructive startup migrations in production'
  $serverRel='backend/src/server.js'
  $serverFile=Join-Path $root $serverRel
  $source=[IO.File]::ReadAllText($serverFile)
  $start='  await User.updateMany({ _id: { $ne: admin.id }, role: ''ADMIN'' }, { role: ''STAFF'' });'
  $end='  await syncGuestReviewNotifications();'
  $marker='  if (process.env.NODE_ENV !== ''production'') {'
  if ($source.Contains($marker)) {
    Write-Host '[OK] Startup migrations already guarded.'
  } else {
    $i=$source.IndexOf($start,[StringComparison]::Ordinal)
    $j=$source.IndexOf($end,[StringComparison]::Ordinal)
    if ($i -lt 0 -or $j -le $i) { throw 'Startup migrations not in expected location. Aborting without guessing.' }
    $j += $end.Length
    $segment=$source.Substring($i,$j-$i)
    $replacement=$marker+"`r`n"+$segment+"`r`n  }"
    Save-Text $serverRel ($source.Substring(0,$i)+$replacement+$source.Substring($j))
  }

  Write-Host '[3/7] Require production secrets and safe admin credentials'
  $anchor='mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000, heartbeatFrequencyMS: 5000 })'
  $guard=@'
if (process.env.NODE_ENV === 'production') {
  for (const name of ['MONGO_URI', 'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']) {
    if (!process.env[name]) throw new Error(`Missing required production setting: ${name}`);
  }
  if (process.env.ADMIN_PASSWORD === 'Admin@123' || process.env.JWT_SECRET.length < 32) {
    throw new Error('Set a strong ADMIN_PASSWORD and a JWT_SECRET of at least 32 characters.');
  }
}

'@
  $source=[IO.File]::ReadAllText($serverFile)
  if ($source.Contains('Missing required production setting:')) { Write-Host '[OK] Production secrets guard already present.' }
  else {
    if ($source.Split(@($anchor),[StringSplitOptions]::None).Length -ne 2) { throw 'Cannot safely insert production environment guard.' }
    Save-Text $serverRel ($source.Replace($anchor,$guard+$anchor))
  }

  Write-Host '[4/7] Cloud frontend CORS'
  $corsReplacement = @'
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.FRONTEND_URL || '').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean),
];
'@
  Replace-Once 'backend/src/app.js' 'const allowedOrigins=["http://localhost:5173", "http://127.0.0.1:5173"];' ($corsReplacement.TrimEnd("`r","`n"))

  Write-Host '[5/7] Vercel SPA support and deployment templates'
  Save-Text 'frontend/vercel.json' @'
{
  "git": { "deploymentEnabled": false },
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
'@ $true
  Save-Text 'frontend/vercel.rewrites.example.json' @'
{
  "git": { "deploymentEnabled": false },
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://YOUR-RENDER-SERVICE.onrender.com/api/:path*" },
    { "source": "/uploads/:path*", "destination": "https://YOUR-RENDER-SERVICE.onrender.com/uploads/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
'@ $true
  Save-Text 'backend/.env.cloud.example' @'
NODE_ENV=production
MONGO_URI=mongodb+srv://DB_USER:DB_PASSWORD@YOUR-CLUSTER.mongodb.net/unilost_v2_9_4?retryWrites=true&w=majority
JWT_SECRET=REPLACE_WITH_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
ADMIN_EMAIL=REPLACE_WITH_ADMIN_EMAIL
ADMIN_PASSWORD=REPLACE_WITH_STRONG_ADMIN_PASSWORD
FRONTEND_URL=https://YOUR-VERCEL-PROJECT.vercel.app
# Optional SMTP on hosting that supports outbound SMTP:
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
'@ $true

  Write-Host '[6/7] Git ignore rules'
  $gitignore=Join-Path $root '.gitignore'
  $rules=@'
# UniLost v2.9.4 - cloud deployment exclusions
**/node_modules/
**/dist/
**/coverage/
**/uploads/
.env
.env.*
**/.env
**/.env.*
!.env.example
!**/.env.example
!**/.env.cloud.example
.vercel/
*.log
.cloud_step1_backup_*/
'@
  if (Test-Path -LiteralPath $gitignore) {
    $current=[IO.File]::ReadAllText($gitignore)
    if (-not $current.Contains('.cloud_step1_backup_*/')) { Save-Text '.gitignore' ($current.TrimEnd()+"`r`n"+$rules) }
    else { Write-Host '[OK] .gitignore includes backup exclusion.' }
  } else { Save-Text '.gitignore' $rules }

  Write-Host '[7/7] Local instructions and verification'
  Save-Text 'CLOUD_SETUP_STEP1.md' @'
# UniLost v2.9.4 - Step 1 cloud preparation

This folder was prepared by `UniLost_v2.9.4_Buoc1_ChuanBiCloud.bat`.

## Applied changes
- Backend binds to 0.0.0.0 in production; localhost behavior remains in development.
- In production, the original boot-time data migration block is skipped. The original development boot behavior is unchanged.
- Production requires MONGO_URI, JWT_SECRET (32+ chars), ADMIN_EMAIL, ADMIN_PASSWORD (not Admin@123).
- Backend CORS accepts FRONTEND_URL in addition to local dev origins.
- frontend/vercel.json handles SPA fallback, but API and uploaded-image rewrites are NOT configured yet.
- frontend/vercel.rewrites.example.json is a TEMPLATE: after Render gives you the backend URL, replace its sample domain and use it as frontend/vercel.json.
- backend/.env.cloud.example is a TEMPLATE. Real secrets belong only in Render environment settings.
- .gitignore excludes local secrets, node_modules, uploads, and cloud-preparation backups.

## Important outstanding work (NOT completed by Step 1)
1. Real MongoDB Atlas, Render, Vercel and GitHub configuration.
2. GitHub Actions CI/CD and GitHub Secrets.
3. Email: SMTP on Render Free can be blocked; use supported hosting or HTTPS email API.
4. Uploaded images: backend stores files locally; persistent object storage is needed before production use.
5. Review the boot-time seed/ensureRequiredData behavior, especially category/location/admin changes.
6. Before publishing: run existing automated tests and review authorization, CORS and secrets.

## Backups
Modified files are backed up under `.cloud_step1_backup_YYYYMMDD_HHMMSS/`.
Do not upload the backup folder to GitHub.

## Verification commands (requires Node.js >=22.12)
From backend: `npm ci` then `npm test`.
From frontend: `npm ci` then `npm run build`.

Do not run `npm run seed` against a live database. Do not commit real `.env` files.
'@ $true

  Write-Host ''
  Write-Host 'Step 1 file changes completed.' -ForegroundColor Green
  if ($modified.Count -gt 0) { Write-Host ("Backups: " + $backup) }
  Write-Host ('Modified: ' + $modified.Count + '; New: ' + $created.Count)
  $node=Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    foreach ($p in @('backend/src/server.js','backend/src/app.js')) {
      $result=& node --check (Join-Path $root $p) 2>&1
      if ($LASTEXITCODE -ne 0) { throw "Node syntax check failed for $p : $result" }
      Write-Host "[PASS] Node syntax: $p" -ForegroundColor Green
    }
  } else {
    Write-Host '[INFO] Node.js not installed or not in PATH; syntax checks skipped.' -ForegroundColor Yellow
  }
  Write-Host 'Full npm tests and Vite build must still be run before deployment.' -ForegroundColor Yellow
} catch {
  Write-Host ("[ERROR] " + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'Please inspect the backup folder; do not push before resolving the error.' -ForegroundColor Yellow
  exit 1
}
