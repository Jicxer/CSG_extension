function isRealPage(tab) {
  if (!tab || !tab.url) return false;
  const url = tab.url;

  // Ignore internal browser / extension pages
  if (url.startsWith("chrome://")) return false;
  if (url.startsWith("chrome-extension://")) return false;
  if (url.startsWith("edge://")) return false;
  if (url.startsWith("about:")) return false;

  return true;
}

// Handle requests from the popup asking "which tab should I use?"
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "GET_TARGET_TAB_ID") {
    chrome.tabs.query({}, (tabs) => {
      try {
        const candidates = tabs.filter(isRealPage);
        if (!candidates.length) {
          sendResponse({ tabId: null });
          return;
        }

        // Choose the tab the user most recently interacted with
        candidates.sort((a, b) => {
          const aLA = typeof a.lastAccessed === "number" ? a.lastAccessed : 0;
          const bLA = typeof b.lastAccessed === "number" ? b.lastAccessed : 0;
          return bLA - aLA;
        });

        sendResponse({ tabId: candidates[0].id });
      } catch (e) {
        console.warn("[Script Keeper] Failed to pick target tab:", e);
        sendResponse({ tabId: null });
      }
    });

    // Keep the message channel open for the async sendResponse above
    return true;
  }
});

// When the toolbar icon is clicked, open a small popup window with our UI
chrome.action.onClicked.addListener(() => {
  const popupUrl = "popup.html";

  chrome.windows.create({
    url: popupUrl,
    type: "popup",
    width: 320,
    height: 310,
    focused: true
  });
});
