# LexiFlow One-Command Local Signed APK Build Script
$ErrorActionPreference = "Stop"

$jdkDir = Get-ChildItem "D:\Android\jdk-17" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $jdkDir) {
    throw "JDK 17 not found under D:\Android\jdk-17"
}

$env:JAVA_HOME = $jdkDir
$env:ANDROID_HOME = "D:\Android\android-sdk"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

Write-Host "1/3 Building web assets..." -ForegroundColor Cyan
npm run build

Write-Host "2/3 Syncing Capacitor Android..." -ForegroundColor Cyan
npx cap sync android

Write-Host "3/3 Assembling signed release APK..." -ForegroundColor Cyan
Push-Location android
try {
    .\gradlew.bat --init-script mirror.init.gradle assembleRelease --no-daemon
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle assembleRelease failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$ver = $pkg.version
$srcApk = "android\app\build\outputs\apk\release\app-release.apk"
New-Item -ItemType Directory -Force -Path "release" | Out-Null
$outApk = "release\LexiFlow-v$ver.apk"
Copy-Item $srcApk $outApk -Force
$hash = (Get-FileHash $outApk -Algorithm SHA256).Hash.ToLower()

Write-Host "`nAPK built successfully!" -ForegroundColor Green
Write-Host "Path:   $((Resolve-Path $outApk).Path)"
Write-Host "SHA256: $hash"
