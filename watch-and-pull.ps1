# watch-and-pull.ps1
# Run on your HOST machine to auto-pull changes from GitHub.
#
# HOW TO RUN (so the window stays open):
#   1. Open PowerShell manually (search "PowerShell" in Start Menu)
#   2. Type: powershell -ExecutionPolicy Bypass -NoExit -File "C:\full\path\to\watch-and-pull.ps1"
#   OR drag and drop this file into the PowerShell window and press Enter

# -----------------------------------------------
# CONFIGURE THESE
$REPO_PATH    = "C:\path\to\your\cloned\repo"   # Full path to cloned repo on host
$GITHUB_REPO  = "YOUR_USERNAME/YOUR_REPO"        # e.g. "jicxer/my-extension"
$BRANCH       = "jicxer-test"
$POLL_SECONDS = 60
$LOG_FILE     = "$PSScriptRoot\watcher-log.txt"
# -----------------------------------------------

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line -ForegroundColor $Color
    Add-Content -Path $LOG_FILE -Value $line
}

function Get-LatestRemoteSha {
    try {
        $url = "https://api.github.com/repos/$GITHUB_REPO/commits/$BRANCH"
        $response = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = "watch-and-pull" }
        return $response.sha
    } catch {
        Write-Log "[!] Could not reach GitHub: $_" "Red"
        return $null
    }
}

function Pull-Latest {
    Push-Location $REPO_PATH

    Write-Log "Running git fetch..." "Yellow"
    git fetch origin 2>&1 | ForEach-Object { Write-Log "  git: $_" "DarkGray" }

    Write-Log "Running git reset --hard origin/$BRANCH ..." "Yellow"
    git reset --hard origin/$BRANCH 2>&1 | ForEach-Object { Write-Log "  git: $_" "DarkGray" }

    # Force-touch all files to update Date Modified timestamp
    Write-Log "Refreshing file timestamps..." "Yellow"
    Get-ChildItem -Path $REPO_PATH -Recurse -File |
        Where-Object { $_.FullName -notmatch "\\.git" } |
        ForEach-Object { $_.LastWriteTime = Get-Date }

    Pop-Location
}

# -----------------------------------------------
# Startup
# -----------------------------------------------
Clear-Host
Write-Host ""
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host "   Extension Auto-Updater" -ForegroundColor Cyan
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host "   Repo   : $GITHUB_REPO" -ForegroundColor Gray
Write-Host "   Branch : $BRANCH" -ForegroundColor Gray
Write-Host "   Path   : $REPO_PATH" -ForegroundColor Gray
Write-Host "   Poll   : every $POLL_SECONDS seconds" -ForegroundColor Gray
Write-Host "   Log    : $LOG_FILE" -ForegroundColor Gray
Write-Host "  ------------------------------------------------" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "$REPO_PATH\.git")) {
    Write-Log "[ERROR] No git repo found at: $REPO_PATH" "Red"
    Write-Log "Clone your repo first with:" "Yellow"
    Write-Log "  git clone https://github.com/$GITHUB_REPO.git `"$REPO_PATH`"" "Yellow"
    Write-Host ""
    Write-Host "Press any key to exit..." -ForegroundColor Red
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Log "Watcher started. Checking every $POLL_SECONDS seconds..." "Green"

$lastKnownSha = Get-LatestRemoteSha
if ($lastKnownSha) {
    Write-Log "Current commit: $($lastKnownSha.Substring(0,7))" "Gray"
}
Write-Host ""

# -----------------------------------------------
# Main loop
# -----------------------------------------------
while ($true) {
    Start-Sleep -Seconds $POLL_SECONDS

    $latestSha = Get-LatestRemoteSha
    if ($null -eq $latestSha) { continue }

    if ($latestSha -ne $lastKnownSha) {
        Write-Log "NEW COMMIT DETECTED: $($latestSha.Substring(0,7))" "Yellow"
        Pull-Latest
        $lastKnownSha = $latestSha
        Write-Log "Done! Reload your extension in edge://extensions/" "Green"
        Write-Host ""
    } else {
        Write-Log "No changes. (commit: $($lastKnownSha.Substring(0,7)))" "DarkGray"
    }
}