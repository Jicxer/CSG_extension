function isRealPage(tab) {
  if (!tab || !tab.url) return false;
  const url = tab.url;
  return !url.startsWith("chrome://") && !url.startsWith("chrome-extension://") && !url.startsWith("edge://") && !url.startsWith("about:");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "GET_TARGET_TAB_ID") {
    chrome.tabs.query({}, (tabs) => {
      try {
        const candidates = tabs.filter(isRealPage);
        candidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
        sendResponse({ tabId: candidates[0]?.id || null });
      } catch (e) {
        console.warn("[Script Keeper] Error picking tab:", e);
        sendResponse({ tabId: null });
      }
    });
    return true;
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: "popup.html",
    type: "popup",
    width: 320,
    height: 310,
    focused: true
  });
});
