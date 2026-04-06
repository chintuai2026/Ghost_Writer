# Ghost Writer Windows Seamless Installer
# This script downloads the Ghost Writer setup executable, installs it silently, and launches it.

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$REPO = "chintuai2026/Ghost_Writer"
$DOWNLOAD_URL = "https://github.com/$REPO/releases/latest/download/Ghost.Writer.Setup.exe"
$TEMP_DIR = $env:TEMP
$INSTALLER_PATH = Join-Path $TEMP_DIR "Ghost.Writer.Setup.exe"

Write-Host "Ghost Writer Windows Installer" -ForegroundColor Cyan
Write-Host "-------------------------------" -ForegroundColor Cyan

Write-Host "Downloading the latest version of Ghost Writer..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri $DOWNLOAD_URL -OutFile $INSTALLER_PATH -UseBasicParsing
} catch {
    Write-Host "Failed to download the installer. Please check your internet connection or try downloading it manually from GitHub." -ForegroundColor Red
    exit 1
}

Write-Host "Installation downloaded. Installing silently..." -ForegroundColor Yellow
try {
    # NSIS silent installation flag is /S (case-sensitive)
    $process = Start-Process -FilePath $INSTALLER_PATH -ArgumentList "/S" -Wait -NoNewWindow -PassThru
    if ($process.ExitCode -ne 0) {
        Write-Host "Installer exited with code $($process.ExitCode)." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Failed to run the installer." -ForegroundColor Red
    exit 1
}

Write-Host "Installation successful." -ForegroundColor Green
Write-Host "Cleaning up..." -ForegroundColor Yellow
try {
    if (Test-Path $INSTALLER_PATH) {
        Remove-Item -Path $INSTALLER_PATH -Force -ErrorAction SilentlyContinue
    }
} catch {
    # Non-critical 
}

$SHORTCUT_PATH = Join-Path $HOME "Desktop\Ghost Writer.lnk"
if (Test-Path $SHORTCUT_PATH) {
    Write-Host "Launching Ghost Writer..." -ForegroundColor Green
    Start-Process -FilePath $SHORTCUT_PATH
} else {
    $APP_PATH = Join-Path $env:LOCALAPPDATA "Programs\ghost-writer\Ghost Writer.exe"
    if (Test-Path $APP_PATH) {
        Write-Host "Launching Ghost Writer..." -ForegroundColor Green
        Start-Process -FilePath $APP_PATH
    } else {
        Write-Host "Could not automatically find the executable to launch, but it was successfully installed." -ForegroundColor Yellow
        Write-Host "You can find Ghost Writer in your Start Menu or Desktop." -ForegroundColor Yellow
    }
}

Write-Host "Setup complete!" -ForegroundColor Cyan
