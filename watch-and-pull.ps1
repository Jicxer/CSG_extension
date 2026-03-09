# watch-and-pull.ps1
# Run this on your HOST machine.
# It checks GitHub every 60 seconds for new commits on a branch and pulls them automatically.
#
# SETUP:
#   1. Clone your repo on the host machine if you haven't already:
#        git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
#   2. Update the two variables below (REPO_PATH and GITHUB_REPO)
#   3. Right-click this script -> "Run with PowerShell"
#      OR run in a terminal: powershell -ExecutionPolicy Bypass -File watch-and-pull.ps1

# -----------------------------------------------
# CONFIGURE THESE
$REPO_PATH   = "C:\path\to\your\cloned\repo"   # Full path to the cloned repo on your host
$GITHUB_REPO = "YOUR_USERNAME/YOUR_REPO"        # e.g. "jicxer/my-extension"
$BRANCH      = "jicxer-test"
$POLL_SECONDS = 60
# -----------------------------------------------

$lastKnownSha = ""

function Get-LatestRemoteSha {
    try {
        $url = "https://api.github.com/repos/$GITHUB_REPO/commits/$BRANCH"
        $response = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = "watch-and-pull" }
        return $response.sha
    } catch {
        Write-Host "  [!] Could not reach GitHub: $_" -ForegroundColor Red
        return $null
    }
}

function Pull-Latest {
    Push-Location $REPO_PATH
    git fetch origin | Out-Null
    git reset --hard origin/$BRANCH | Out-Null
    Pop-Location
}

# Validate repo path
if (-not (Test-Path "$REPO_PATH\.git")) {
    Write-Host ""
    Write-Host "  [ERROR] No git repo found at: $REPO_PATH" -ForegroundColor Red
    Write-Host "  Please clone your repo first:" -ForegroundColor Yellow
    Write-Host "    git clone https://github.com/$GITHUB_REPO.git" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host "   Extension Auto-Updater" -ForegroundColor Cyan
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host "   Repo   : $GITHUB_REPO" -ForegroundColor Gray
Write-Host "   Branch : $BRANCH" -ForegroundColor Gray
Write-Host "   Path   : $REPO_PATH" -ForegroundColor Gray
Write-Host "   Polling: every $POLL_SECONDS seconds" -ForegroundColor Gray
Write-Host "  ------------------------------------------------" -ForegroundColor Cyan
Write-Host ""

# Get initial SHA so we don't pull on first run
$lastKnownSha = Get-LatestRemoteSha
Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] Watching for changes on '$BRANCH'..." -ForegroundColor Green
Write-Host "  Current commit: $($lastKnownSha.Substring(0,7))" -ForegroundColor Gray
Write-Host ""

while ($true) {
    Start-Sleep -Seconds $POLL_SECONDS

    $latestSha = Get-LatestRemoteSha

    if ($null -eq $latestSha) {
        continue
    }

    if ($latestSha -ne $lastKnownSha) {
        $short = $latestSha.Substring(0, 7)
        Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] 🔄 New commit detected: $short" -ForegroundColor Yellow
        Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] Pulling latest changes..." -ForegroundColor Yellow

        Pull-Latest

        $lastKnownSha = $latestSha
        Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] ✅ Done! Reload your extension in edge://extensions/" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] No changes." -ForegroundColor DarkGray
    }
}