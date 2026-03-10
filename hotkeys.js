/**
 * Content script: listens for user-defined keyboard shortcuts and triggers the
 * matching macro by messaging the background service worker, which then injects
 * the macro runner into the current tab via chrome.scripting.executeScript.
 * The hotkey map is rebuilt whenever macros change in chrome.storage.sync.
 */

let hotkeyMap = {};

/**
 * Converts a KeyboardEvent into a normalized hotkey string (e.g. "Ctrl+Alt+A",
 * "Alt+1", "Shift+F2"). Returns null for modifier-only keypresses.
 * @param {KeyboardEvent} e
 * @returns {string|null}
 */
function normalizeHotkey(e) {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;
  const parts = [];
  if (e.ctrlKey)  parts.push("Ctrl");
  if (e.altKey)   parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return parts.join("+");
}

/**
 * Rebuilds the hotkey → macro config lookup map from the stored macros array.
 * @param {Array} macros
 */
function buildHotkeyMap(macros) {
  hotkeyMap = {};
  for (const macro of (macros || [])) {
    if (macro.hotkey) hotkeyMap[macro.hotkey] = macro;
  }
}

/**
 * Loads macros from chrome.storage.sync on page load and populates the map.
 */
async function init() {
  const stored = await chrome.storage.sync.get("macros");
  buildHotkeyMap(stored.macros || []);
}

init();

// Keep the map in sync if the user edits macros while the tab is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.macros) {
    buildHotkeyMap(changes.macros.newValue || []);
  }
});

/**
 * Global keydown handler. Skips events fired while the user is typing in a
 * standard text field, then checks the hotkey map and messages the background.
 */
document.addEventListener("keydown", (e) => {
  // Don't intercept while the user is typing in a normal input or textarea.
  const tag = (document.activeElement?.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  const hotkey = normalizeHotkey(e);
  if (!hotkey || !hotkeyMap[hotkey]) return;

  e.preventDefault();
  e.stopPropagation();

  chrome.runtime.sendMessage({
    type: "TRIGGER_HOTKEY_MACRO",
    config: hotkeyMap[hotkey]
  });
}, { capture: true });
