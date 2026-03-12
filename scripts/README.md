# Host Machine Setup

This script runs on your **host machine** and automatically pulls the latest
code from GitHub whenever you push from your VM.

---

## One-Time Setup

### 1. Clone the repo on your host machine
Open PowerShell and run:
```powershell
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git C:\path\to\your\extension
```

### 2. Load the extension in Edge via Load Unpacked
1. Open `edge://extensions/`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the folder you just cloned — where `manifest.json` lives

### 3. Configure the watcher script
Open `watch-and-pull.ps1` and update these two lines at the top:
```powershell
$REPO_PATH   = "C:\path\to\your\cloned\repo"   # e.g. C:\Users\You\Documents\my-extension
$GITHUB_REPO = "YOUR_USERNAME/YOUR_REPO"        # e.g. jicxer/my-extension
```

### 4. Run the watcher
Right-click `watch-and-pull.ps1` and choose **Run with PowerShell**,
or in a terminal:
```powershell
powershell -ExecutionPolicy Bypass -File watch-and-pull.ps1
```

Leave this window open in the background.

---

## Daily Workflow

1. **On your VM:** write code and push to your branch as normal
2. **On your host:** the watcher detects the new commit within 60 seconds and pulls automatically
3. Go to `edge://extensions/` and click the **reload icon** on your extension
4. Done 

This can also be done without a VM and just push your code to branch while having the script running in the background.
---

## Troubleshooting

**"No git repo found" error**
→ Make sure you've cloned the repo and the `$REPO_PATH` points to the folder containing `.git`

**Script won't run due to execution policy**
→ Run this once in PowerShell as Administrator:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

**Changes not appearing after reload**
→ Hard reload Edge: `Ctrl+Shift+R` on the extension's page, or remove and re-add via Load Unpacked
