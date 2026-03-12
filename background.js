/**
 * Determines whether a tab represents a real, navigable web page.
 * Filters out internal browser pages (chrome://, edge://, about:) and
 * extension pages so they are never targeted by the macro runner.
 * @param {chrome.tabs.Tab} tab - The tab object to evaluate.
 * @returns {boolean} True if the tab has a usable URL.
 */
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Handle requests from the popup asking "which tab should I use?"
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

  // Handle hotkey triggers from the content script (hotkeys.js).
  // sender.tab.id is the tab that sent the message — i.e. the ticket page.
  if (msg && msg.type === "TRIGGER_HOTKEY_MACRO") {
    const tabId = sender.tab?.id;
    if (!tabId) return false;
    const config = msg.config;
    chrome.scripting.executeScript({
      target: { tabId },
      func: config.autofill ? runAutofill : runTicketMacro,
      args: [config]
    }).catch((err) => {
      console.warn("[Script Keeper] Hotkey macro injection failed:", err);
    });
    return false;
  }
});

// When the toolbar icon is clicked, open a small popup window with our UI
chrome.action.onClicked.addListener(() => {
  const popupUrl = "popup.html";

  chrome.windows.create({
    url: popupUrl,
    type: "popup",
    width: 320,
    height: 360,
    focused: true
  });
});

// =============================================================================
// Macro runner functions — injected into the ticket page via executeScript.
// These must be entirely self-contained (no closure over background scope).
// They are identical to the versions in popup.js so both the popup buttons
// and hotkey triggers produce the same behaviour.
// =============================================================================

/**
 * Runs a standard ticket macro in the target tab: opens the Add Note modal,
 * unchecks recipient checkboxes, writes the note, sets all dropdowns, saves.
 * @param {Object} config - Macro config from storage.
 */
async function runTicketMacro(config) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const waitFor = async (fn, timeoutMs = 4000, interval = 40) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const v = fn();
      if (v) return v;
      await sleep(interval);
    }
    return null;
  };

  const waitForMutation = (predicate, timeoutMs = 4000) => {
    return new Promise((resolve) => {
      const immediate = predicate();
      if (immediate) return resolve(immediate);
      const obs = new MutationObserver(() => {
        const v = predicate();
        if (v) { obs.disconnect(); resolve(v); }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
    });
  };

  const isVisible = (el) =>
    !!(el && (el.offsetParent !== null || (el.getClientRects && el.getClientRects().length)));

  const click = (el) => {
    if (!el) return false;
    try { el.scrollIntoView({ block: "center", inline: "center" }); } catch {}
    try {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    } catch {
      try { el.click(); return true; } catch { return false; }
    }
  };

  const findButtonByText = (root, text) => {
    const target = (text || "").trim().toLowerCase();
    for (const el of root.querySelectorAll("button, a, input[type='button'], input[type='submit']")) {
      if (((el.textContent || el.value) || "").trim().toLowerCase() === target) return el;
    }
    return null;
  };

  const findButtonContains = (root, text) => {
    const target = (text || "").trim().toLowerCase();
    for (const el of root.querySelectorAll("button, a, input[type='button'], input[type='submit']")) {
      if (((el.textContent || el.value) || "").trim().toLowerCase().includes(target)) return el;
    }
    return null;
  };

  const setSelectByValueOrText = (selectEl, value, text) => {
    if (!selectEl) return;
    if (value != null && value !== "") {
      for (const opt of selectEl.options) {
        if (opt.value === value) {
          selectEl.value = value;
          selectEl.dispatchEvent(new Event("change", { bubbles: true }));
          return;
        }
      }
    }
    if (text) {
      const target = text.trim().toLowerCase();
      for (const opt of selectEl.options) {
        const t = (opt.textContent || opt.innerText || "").trim().toLowerCase();
        if (t === target || t.includes(target)) {
          selectEl.value = opt.value;
          selectEl.dispatchEvent(new Event("change", { bubbles: true }));
          return;
        }
      }
    }
  };

  const waitForOptions = async (selectEl, timeout = 6000, interval = 150) => {
    if (!selectEl) return;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (Array.from(selectEl.options).some((o) => o.value !== "")) return;
      await sleep(interval);
    }
    console.warn("[Script Keeper] waitForOptions timed out for:", selectEl.id || selectEl.name);
  };

  const findSelect = (...hints) => {
    for (const hint of hints) {
      const el = document.getElementById(hint);
      if (el && el.tagName === "SELECT") return el;
    }
    for (const s of document.querySelectorAll("select")) {
      const id = (s.id || "").toLowerCase();
      const name = (s.name || "").toLowerCase();
      const labelText = (s.closest("div")?.querySelector("label")?.innerText || "").toLowerCase();
      for (const hint of hints) {
        const h = hint.toLowerCase();
        if (id.includes(h) || name.includes(h) || labelText.includes(h)) return s;
      }
    }
    return null;
  };

  const getTopOverlay = () => {
    const fp = document.querySelector("#FilePreviewModal");
    if (fp && isVisible(fp)) return fp;
    const mfp = document.querySelector(".mfp-wrap.mfp-ready");
    if (mfp && isVisible(mfp)) return mfp;
    return Array.from(document.querySelectorAll(".modal.show, .modal.fade.in")).find(isVisible) || null;
  };

  const closeOverlayFast = async () => {
    const overlay = getTopOverlay();
    if (!overlay) return true;
    const closeBtn =
      overlay.querySelector(".mfp-close") ||
      overlay.querySelector("[data-dismiss='modal']") ||
      overlay.querySelector(".close") ||
      findButtonByText(overlay, "close") ||
      findButtonContains(overlay, "close");
    if (closeBtn && isVisible(closeBtn)) click(closeBtn);
    else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return !!(await waitFor(() => !getTopOverlay(), 2500, 50));
  };

  const getNotesModalRoot = () => {
    const wrap = document.querySelector(".mfp-wrap.mfp-ready");
    if (wrap && isVisible(wrap)) {
      const add = wrap.querySelector(".mfp-content #modal-addnote");
      if (add && isVisible(add)) return add;
    }
    const add2 = document.querySelector("#modal-addnote");
    if (add2 && isVisible(add2)) return add2;
    return null;
  };

  const openNotesModal = async () => {
    const addNoteButton =
      document.getElementById("aAddNotes") ||
      Array.from(document.querySelectorAll("a,button")).find((el) => {
        const txt = (el.textContent || "").trim().toLowerCase();
        return txt === "add new" || txt === "add note" || txt === "add/send note" || txt === "add/send notes";
      }) || null;
    if (!addNoteButton) return null;
    click(addNoteButton);
    return (
      (await waitForMutation(() => getNotesModalRoot(), 4500)) ||
      (await waitFor(() => getNotesModalRoot(), 4500, 50))
    );
  };

  const forceUncheck = (id) => {
    const cb = document.getElementById(id);
    if (!cb) return false;
    if (cb.checked) { click(cb); cb.dispatchEvent(new Event("change", { bubbles: true })); }
    return true;
  };

  const waitCheckboxUnchecked = (id) =>
    waitFor(() => {
      const cb = document.getElementById(id);
      return (!cb || cb.checked === false) ? true : null;
    }, 1500, 40);

  const getTextarea = (root) =>
    root.querySelector("#txtNoteDescription") ||
    root.querySelector("textarea[id*='NoteDescription']") ||
    root.querySelector("textarea[name*='Note']");

  const getProseMirror = (root) =>
    root.querySelector("#supportNoteEditor_detailTab .ProseMirror[contenteditable='true']") ||
    root.querySelector(".ProseMirror[contenteditable='true']");

  const waitEditorReady = async (modalRoot) => {
    const ta = await waitFor(() => {
      const t = getTextarea(modalRoot);
      return (t && isVisible(t)) ? t : null;
    }, 2500, 40);
    if (ta) return { textarea: ta, prose: null };
    const pm = await waitFor(() => {
      const p = getProseMirror(modalRoot);
      if (!p || !isVisible(p)) return null;
      if (p.getBoundingClientRect().height < 60) return null;
      return p;
    }, 3500, 40);
    return pm ? { textarea: null, prose: pm } : null;
  };

  const setTextareaNote = (textarea, text) => {
    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const setProseMirrorNote = async (pm, text) => {
    pm.focus();
    await sleep(40);
    pm.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a", ctrlKey: true }));
    pm.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Backspace" }));
    await sleep(60);
    try { document.execCommand("insertText", false, text); } catch {}
    if (!(pm.textContent || "").trim().length) {
      pm.textContent = text;
      pm.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  };

  const waitModalClosed = () => waitFor(() => !getNotesModalRoot(), 5000, 50);

  const itemCategories = {
    "No Withdrawal Activity": ["no withdrawals dispatch"],
    "No Transaction Activity": [
      "Notification for ACTMON",
      "Business Rule : No Transactions Activity, Fault Descr : No transaction activity",
      "ATM Processing Transactions", "ATM Inactive greater than",
      "ZERO TRANS TERMINAL/8 HOURS", "ZERO TRANS TERMINAL/12 HOURS",
      "Status code Description :ZERO TRANS TERMINAL/18 HOURS"
    ],
    "Lost Comms": [
      "comm dispatch", "offline",
      "Business Rule : Lost Communication, Fault Descr : Session closed by partner",
      "In Service to Off-Line", "CommR Dispatch", "Online",
      "Notification for COMMUNICATION FAILURE",
      "(5003, critical)", "(113, info)", "(5004, suspect)", "status='C7'",
      "Terminal Off Line As Of", "Terminal Closed As Of",
      "Category: Supervisor Dispatch",
      "Business Rule : Out of Service, Fault Descr : No Load", "(30, suspect)",
      "Business Rule : Risk Condition, Fault Descr : Excessive txn reversals",
      "Status code Description :DEVICE IN MAINTENANCE",
      "Terminal in Supervisor As Of", "Last Transaction Reversed As Of",
      "Status='C1' (Communication line not available)",
      "RVClient - Failed to Send Heartbeats -",
      "The ATM changed mode from Closed to Off-Line.",
      "Status code Description :SESSION CLOSED",
      "Status code Description :KEY SYNC ERROR",
      "Status Code Description: ATM OUT OF SERVICE",
      "Status code Description :DEVICE IS CLOSED"
    ],
    "Depositor": [
      "Depository Dispatch",
      "Business Rule : Device Fault, Fault Descr : Depository down",
      "Notification for DEPOSITORY FAILURE", "(2009, critical)",
      "Notification for CK/MICR READER FAILURE for Device", "(2211, suspect)",
      "Business Rule : Device Fault, Fault Descr : Envelope printer down",
      "Business Rule : Device Fault, Fault Descr : Document depository down",
      "Business Rule : Printer Paper Other Supply Problems, Fault Descr : Depository low/full",
      "Status code Description :DEPOSITORY LOW/FULL",
      "Status Code Description: USB Scalable Deposit Module 2",
      "Status code Description :DEPOSITORY DOWN",
      "Notification for CASH ACCEPTOR FAILURE", "Depositor"
    ],
    "Dispenser": [
      "Dispenser Dispatch",
      "Business Rule : Device Fault, Fault Descr : Cash handler down",
      "Notification for MULTIPLE DISPENSER FAILURE",
      "Business Rule : Device Fault, Fault Descr : Cash handler bill jammed",
      "status='0010'", "status='0008'",
      "(46, critical)", "(2001, critical)", "(2005, critical)",
      "Notification for DIVERT FAILURE", "Category: Cash Out Dispatch",
      "Business Rule : Device Fault, Fault Descr : Canister",
      "Business Rule : Device Fault, Fault Descr : Cash hand bills not seen exit",
      "Notification for DISPENSER FAILURE",
      "Status code Description :CASH HANDLER DOWN",
      "Status code Description :CANISTER",
      "Notification for CASH THRESHOLD LIMIT REACHED", "CASH HANDLER DOWN",
      "Business Rule : Device Fault, Fault Descr : Cash hand bills not seen at exit"
    ],
    "Printer": [
      "Receipt Printer Dispatch", "(2047, critical)",
      "Business Rule : Device Fault, Fault Descr : Cons prt head jam/go busy fail",
      "Business Rule : Device Fault, Fault Descr : Cons prt paper not load or jam",
      "Business Rule : Printer Paper Other Supply Problems, Fault Descr : Consumer printer fault",
      "Business Rule : Device Fault, Fault Descr : Consumer prt paper jam",
      "Status code Description :CONSUMER PRINTER DOWN", "CONSUMER PRINTER DOWN",
      "Notification for RECEIPT PRINTER FAILURE"
    ],
    "Card Reader": [
      "Card reader Dispatch",
      "Business Rule : Out of Service, Fault Descr : Card reader fault",
      "Notification for EMV CARD READER FAILURE",
      "(2280, suspect)", "(2020, critical)", "(2281, critical)",
      "Business Rule : Device Fault, Fault Descr : Card capture bin full",
      "Status code Description :Mult. Card Reader/Writer Warns",
      "Status code Description :CARD READER/WRITER DOWN"
    ],
    "Cassette": ["status='0016'", "Cassettes of type", "(50, critical)"],
    "EPP": [
      "Business Rule : Out of Service, Fault Descr : Encryptor down",
      "Notification for ENCRYPTION FAILURE for Device",
      "Status code Description :ENCRYPTOR DOWN", "Category: Encryptor Dispatch"
    ],
    "Anti Skimming": [
      "Business Rule : Out of Service, Fault Descr : Card skimming fraud detected Hard Fault",
      "Category: Security Dispatch", "(2031, critical)",
      "Business Rule : Risk Condition, Fault Descr : Card skimming device detected",
      "Status code Description :POSSIBLE SKIMMING DEVICE DETECTED"
    ]
  };

  const getLabel = () => {
    const titleEl = document.getElementById("txtTitle");
    const titleValue = (titleEl ? titleEl.value : "").trim().toLowerCase();
    const lastNote = Array.from(document.querySelectorAll(".notice_info")).at(-1)?.textContent.trim().toLowerCase() || "";
    for (const [label, keywords] of Object.entries(itemCategories)) {
      for (const kw of keywords) {
        if (titleValue.includes(kw.toLowerCase()) || lastNote.includes(kw.toLowerCase())) return label;
      }
    }
    return null;
  };

  const setDropdowns = async () => {
    const typeSelect = findSelect("ddlType", "type");
    if (typeSelect) setSelectByValueOrText(typeSelect, config.typeValue, config.typeText);
    else console.warn("[Script Keeper] Type dropdown not found.");

    const subTypeSelect = findSelect("ddlSubType", "subtype", "sub-type", "sub type");
    if (subTypeSelect) {
      await waitForOptions(subTypeSelect);
      setSelectByValueOrText(subTypeSelect, config.subTypeValue, config.subTypeText);
    } else console.warn("[Script Keeper] Sub-Type dropdown not found.");

    const itemSelect = findSelect("ddlSubTypeItem", "item");
    if (itemSelect) {
      await waitForOptions(itemSelect);
      const itemText = config.autoDetectItem ? getLabel() : config.itemText;
      if (itemText) setSelectByValueOrText(itemSelect, config.itemValue, itemText);
      else console.warn("[Script Keeper] Could not resolve item text.");
    } else console.warn("[Script Keeper] Item dropdown not found.");

    if (config.stateText) {
      const stateSelect = findSelect("ddlStatus", "status", "state");
      if (stateSelect) setSelectByValueOrText(stateSelect, "", config.stateText);
      else console.warn("[Script Keeper] State/Status dropdown not found.");
    }
  };

  const save = () => {
    const saveBtn =
      findButtonByText(document, "save") ||
      Array.from(document.querySelectorAll("a.btn.btn-primary, button.btn.btn-primary"))
        .find((el) => (el.textContent || "").trim().toLowerCase() === "save") ||
      null;
    if (saveBtn) click(saveBtn);
    else console.warn("[Script Keeper] Save button not found.");
  };

  try {
    console.log("[Script Keeper] Running macro (hotkey):", config?.name);
    await closeOverlayFast();
    const modalRoot = await openNotesModal();
    if (!modalRoot) throw new Error("Notes modal not found");
    forceUncheck("chkContact");
    forceUncheck("chkResources");
    forceUncheck("chkCC") || forceUncheck("chkCc");
    await Promise.all([
      waitCheckboxUnchecked("chkContact"),
      waitCheckboxUnchecked("chkResources"),
      waitCheckboxUnchecked("chkCC")
    ]);
    const editor = await waitEditorReady(modalRoot);
    if (!editor) throw new Error("Note editor not ready");
    if (config.noteText) {
      if (editor.textarea) setTextareaNote(editor.textarea, config.noteText);
      else await setProseMirrorNote(editor.prose, config.noteText);
    }
    const submitBtn = findButtonByText(modalRoot, "submit") || findButtonContains(modalRoot, "submit");
    if (submitBtn) click(submitBtn);
    await waitModalClosed();
    await setDropdowns();
    save();
    return { success: true };
  } catch (err) {
    console.error("[Script Keeper] Macro error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Runs the autofill macro in the target tab: extracts the Terminal ID, fetches
 * ticket history to determine company/location, sets all fields and equipment.
 */
async function runAutofill() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const waitForSel = async (selector, timeout = 8000, interval = 150) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(interval);
    }
    return null;
  };

  const waitForTableReady = async (selector, minCells = 13, timeout = 8000, interval = 150) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const table = document.querySelector(selector);
      if (table) {
        const validRow = Array.from(table.querySelectorAll("tbody tr")).find(
          (row) => row.querySelectorAll("td").length >= minCells
        );
        if (validRow) return table;
      }
      await sleep(interval);
    }
    console.warn("[Script Keeper] Timeout waiting for table:", selector);
    return null;
  };

  const findOption = (dropdown, label) =>
    Array.from(dropdown.options).find(
      (opt) => opt.textContent.trim().toLowerCase() === label.toLowerCase()
    ) || null;

  const mostFrequentValue = (arr, prop) => {
    if (!arr || !prop) return { value: null, count: null };
    const freq = arr.reduce((acc, item) => {
      const v = item[prop];
      acc[v] = (acc[v] || 0) + 1;
      return acc;
    }, {});
    let bestValue = null, bestCount = 0;
    for (const [value, count] of Object.entries(freq)) {
      if (count > bestCount) { bestValue = value; bestCount = count; }
    }
    return { value: bestValue, count: bestCount };
  };

  const tidRegexes = [
    /Terminal Id\s*:?\s*(\w{6,8})/i,
    /Terminal ID\W*(\w{6,8})/i,
    /Device\s*:?\s*(\w{6,8})/i,
    /Term ID\s*:?\s*(\w{6,8})/i,
    /ATM ID:\s*:?\s*(\w{6,8})/i,
    /\S+CBC\S+\s(\w{6,8})/i,
    /(?=.*[()])([^()]+)(?=\s*)/i,
    /(\b\w{6,8}\b)(?=\s+(?:returned|is))/i,
    /(\b\w{6,8}\b)(?=\s+(?:The ATM))/i,
    /DCU\sATM\S*\s(\w{6,8})/i,
    /ATM ALERT\S\s(\w{6,8})/i,
    /Failed to Send Heartbeats\s\S\s(\w{6,8})/i,
    /(\w{6,8})(?=\sTerminal)/
  ];

  const extractTID = (title) => {
    for (const re of tidRegexes) {
      const m = title.match(re);
      if (m && m[1]) return m[1];
    }
    return null;
  };

  const fetchTicketHistory = async (tid) => {
    if (!tid) return null;
    const res = await fetch("https://cc.cooksolutionsgroup.com/Support/Dashboard/GetDashboardTickets", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageNo: 1, pageSize: 50, OrderByDesc: true,
        TeamRecId: "4", BoardRecId: "14",
        IncludeChildren: false, ExcludeOpenTime: false,
        CallFrom: 1, IncludeInternalNote: true, CreatedDateFilter: "0",
        ColumnLevelSearch: { TicketRecId: null, Title: tid }
      })
    });
    if (!res.ok) { console.error("[Script Keeper] Ticket fetch failed:", res.status); return null; }
    const data = await res.json();
    return Object.values(data.rows).map((t) => ({
      TicketRecId: t.TicketRecId,
      CustomerName: t.CustomerName,
      Location: t.Location,
      CreatedDateUTC: t.CreatedDateUTC,
      UpdatedDateUTC: t.UpdatedDateUTC
    }));
  };

  const itemCategories = {
    "No Withdrawal Activity": ["no withdrawals dispatch"],
    "No Transaction Activity": [
      "Notification for ACTMON",
      "Business Rule : No Transactions Activity, Fault Descr : No transaction activity",
      "ATM Processing Transactions", "ATM Inactive greater than",
      "ZERO TRANS TERMINAL/8 HOURS", "ZERO TRANS TERMINAL/12 HOURS",
      "Status code Description :ZERO TRANS TERMINAL/18 HOURS"
    ],
    "Lost Comms": [
      "comm dispatch", "offline",
      "Business Rule : Lost Communication, Fault Descr : Session closed by partner",
      "In Service to Off-Line", "CommR Dispatch", "Online",
      "Notification for COMMUNICATION FAILURE",
      "(5003, critical)", "(113, info)", "(5004, suspect)", "status='C7'",
      "Terminal Off Line As Of", "Terminal Closed As Of",
      "Category: Supervisor Dispatch",
      "Business Rule : Out of Service, Fault Descr : No Load", "(30, suspect)",
      "Business Rule : Risk Condition, Fault Descr : Excessive txn reversals",
      "Status code Description :DEVICE IN MAINTENANCE",
      "Terminal in Supervisor As Of", "Last Transaction Reversed As Of",
      "Status='C1' (Communication line not available)",
      "RVClient - Failed to Send Heartbeats -",
      "The ATM changed mode from Closed to Off-Line.",
      "Status code Description :SESSION CLOSED",
      "Status code Description :KEY SYNC ERROR",
      "Status Code Description: ATM OUT OF SERVICE",
      "Status code Description :DEVICE IS CLOSED"
    ],
    "Depositor": [
      "Depository Dispatch",
      "Business Rule : Device Fault, Fault Descr : Depository down",
      "Notification for DEPOSITORY FAILURE", "(2009, critical)",
      "Notification for CK/MICR READER FAILURE for Device", "(2211, suspect)",
      "Business Rule : Device Fault, Fault Descr : Envelope printer down",
      "Business Rule : Device Fault, Fault Descr : Document depository down",
      "Business Rule : Printer Paper Other Supply Problems, Fault Descr : Depository low/full",
      "Status code Description :DEPOSITORY LOW/FULL",
      "Status Code Description: USB Scalable Deposit Module 2",
      "Status code Description :DEPOSITORY DOWN",
      "Notification for CASH ACCEPTOR FAILURE", "Depositor"
    ],
    "Dispenser": [
      "Dispenser Dispatch",
      "Business Rule : Device Fault, Fault Descr : Cash handler down",
      "Notification for MULTIPLE DISPENSER FAILURE",
      "Business Rule : Device Fault, Fault Descr : Cash handler bill jammed",
      "status='0010'", "status='0008'",
      "(46, critical)", "(2001, critical)", "(2005, critical)",
      "Notification for DIVERT FAILURE", "Category: Cash Out Dispatch",
      "Business Rule : Device Fault, Fault Descr : Canister",
      "Business Rule : Device Fault, Fault Descr : Cash hand bills not seen exit",
      "Notification for DISPENSER FAILURE",
      "Status code Description :CASH HANDLER DOWN",
      "Status code Description :CANISTER",
      "Notification for CASH THRESHOLD LIMIT REACHED", "CASH HANDLER DOWN",
      "Business Rule : Device Fault, Fault Descr : Cash hand bills not seen at exit"
    ],
    "Printer": [
      "Receipt Printer Dispatch", "(2047, critical)",
      "Business Rule : Device Fault, Fault Descr : Cons prt head jam/go busy fail",
      "Business Rule : Device Fault, Fault Descr : Cons prt paper not load or jam",
      "Business Rule : Printer Paper Other Supply Problems, Fault Descr : Consumer printer fault",
      "Business Rule : Device Fault, Fault Descr : Consumer prt paper jam",
      "Status code Description :CONSUMER PRINTER DOWN", "CONSUMER PRINTER DOWN",
      "Notification for RECEIPT PRINTER FAILURE"
    ],
    "Card Reader": [
      "Card reader Dispatch",
      "Business Rule : Out of Service, Fault Descr : Card reader fault",
      "Notification for EMV CARD READER FAILURE",
      "(2280, suspect)", "(2020, critical)", "(2281, critical)",
      "Business Rule : Device Fault, Fault Descr : Card capture bin full",
      "Status code Description :Mult. Card Reader/Writer Warns",
      "Status code Description :CARD READER/WRITER DOWN"
    ],
    "Cassette": ["status='0016'", "Cassettes of type", "(50, critical)"],
    "EPP": [
      "Business Rule : Out of Service, Fault Descr : Encryptor down",
      "Notification for ENCRYPTION FAILURE for Device",
      "Status code Description :ENCRYPTOR DOWN", "Category: Encryptor Dispatch"
    ],
    "Anti Skimming": [
      "Business Rule : Out of Service, Fault Descr : Card skimming fraud detected Hard Fault",
      "Category: Security Dispatch", "(2031, critical)",
      "Business Rule : Risk Condition, Fault Descr : Card skimming device detected",
      "Status code Description :POSSIBLE SKIMMING DEVICE DETECTED"
    ]
  };

  const getLabel = () => {
    const titleEl = document.getElementById("txtTitle");
    const titleValue = titleEl ? titleEl.value.trim().toLowerCase() : "";
    const lastNote = Array.from(document.querySelectorAll(".notice_info")).at(-1)?.textContent.trim().toLowerCase() || "";
    for (const [label, keywords] of Object.entries(itemCategories)) {
      for (const keyword of keywords) {
        if (titleValue.includes(keyword.toLowerCase()) || lastNote.includes(keyword.toLowerCase())) return label;
      }
    }
    return null;
  };

  const setStatusToInProgress = async () => {
    const statusDropDown = await waitForSel("#ddlStatus");
    if (!statusDropDown) { console.warn("[Script Keeper] Status dropdown not found."); return; }
    const opt = findOption(statusDropDown, "in progress");
    if (opt) statusDropDown.value = opt.value;
  };

  const autoChangeType = async () => {
    const boardDropDown = await waitForSel("#ddlBoard");
    if (!boardDropDown) return;
    const atmOpt = findOption(boardDropDown, "atm/itm");
    if (!atmOpt || boardDropDown.value !== atmOpt.value) return;
    const typeDropDown = await waitForSel("#ddlType");
    if (typeDropDown) {
      const hwOpt = findOption(typeDropDown, "hardware");
      if (hwOpt) {
        typeDropDown.value = hwOpt.value;
        typeDropDown.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    const subTypeDropDown = await waitForSel("#ddlSubType");
    if (subTypeDropDown) {
      const netOpt = findOption(subTypeDropDown, "network notification");
      if (netOpt) {
        subTypeDropDown.value = netOpt.value;
        subTypeDropDown.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  };

  const selectItem = async () => {
    const itemDropDown = await waitForSel("#ddlSubTypeItem");
    if (!itemDropDown) { console.warn("[Script Keeper] Item dropdown not found."); return; }
    const label = getLabel();
    if (!label) { console.warn("[Script Keeper] Could not detect item label from title/notes."); return; }
    const opt = findOption(itemDropDown, label);
    if (opt) itemDropDown.value = opt.value;
  };

  const selectCompany = async (companyDropDown, ticketHistory) => {
    if (companyDropDown.options.length <= 2) return false;
    const bomOpt = findOption(companyDropDown, "West Michigan Credit Union");
    if (companyDropDown.selectedIndex !== 0 && companyDropDown.value !== bomOpt?.value) return false;
    const best = mostFrequentValue(ticketHistory, "CustomerName");
    if (!best.value || best.value === "null") {
      const csgOpt = findOption(companyDropDown, "Cook Solutions Group");
      if (csgOpt) {
        companyDropDown.value = csgOpt.value;
        companyDropDown.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return false;
    }
    const matched = findOption(companyDropDown, best.value);
    if (!matched) { console.warn("[Script Keeper] Company option not found:", best.value); return false; }
    companyDropDown.value = matched.value;
    companyDropDown.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const selectLocation = async (ticketHistory) => {
    const locationDropDown = await waitForSel("#ddlLocation");
    if (!locationDropDown) { console.warn("[Script Keeper] Location dropdown not found."); return null; }
    const start = Date.now();
    while (locationDropDown.options.length <= 1 && Date.now() - start < 10000) await sleep(500);
    if (locationDropDown.options.length <= 1) { console.warn("[Script Keeper] Location dropdown did not populate."); return null; }
    const best = mostFrequentValue(ticketHistory, "Location");
    const matched = Array.from(locationDropDown.options).find(
      (opt) => best.value && best.value.includes(opt.value)
    );
    if (!matched) { console.warn("[Script Keeper] No matching location found."); return null; }
    locationDropDown.value = matched.value;
    locationDropDown.dispatchEvent(new Event("change", { bubbles: true }));
    return { res: true, TID: matched.dataset?.subtitle3 || "" };
  };

  const addEquipment = async (locationTID) => {
    const addEquipBtn =
      document.getElementById("btnAddNewEquipment") ||
      Array.from(document.querySelectorAll("a, button")).find((el) =>
        (el.textContent || "").trim().toLowerCase().includes("add new equipment")
      ) || null;
    if (!addEquipBtn) { console.warn("[Script Keeper] Add Equipment button not found."); return; }
    addEquipBtn.click();
    const table = await waitForTableReady("#tblEquipmentListing");
    if (!table) { console.warn("[Script Keeper] Equipment table not found."); return; }
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    const matchedRow = rows.find((row) => {
      const terminal = row.querySelectorAll("td")[6]?.textContent.trim().toLowerCase();
      return terminal && locationTID.TID.toLowerCase().includes(terminal);
    });
    if (matchedRow) matchedRow.querySelector("td:first-child input")?.click();
    else console.warn("[Script Keeper] No matching equipment row found.");
    const associateBtn =
      document.getElementById("btnAssociatedEquipment") ||
      Array.from(document.querySelectorAll("a, button")).find((el) =>
        (el.textContent || "").trim().toLowerCase().includes("associated equipment")
      ) || null;
    if (associateBtn) associateBtn.click();
    else console.warn("[Script Keeper] Associate Equipment button not found.");
  };

  try {
    console.log("[Script Keeper] Running autofill (hotkey)");
    const titleValue = document.getElementById("txtTitle")?.value.trim().toLowerCase() || "";
    const TID = extractTID(titleValue);
    const companyDropDown = await waitForSel("#ddlSupportCompany");
    if (!companyDropDown) throw new Error("Company dropdown not found");
    let ticketHistory = null;
    const bomOpt = findOption(companyDropDown, "Bank Michigan");
    if (companyDropDown.selectedIndex === 0 || companyDropDown.value === bomOpt?.value) {
      if (TID) ticketHistory = await fetchTicketHistory(TID);
    }
    const changedCompany = await selectCompany(companyDropDown, ticketHistory);
    await setStatusToInProgress();
    await autoChangeType();
    await selectItem();
    if (changedCompany) {
      await sleep(500);
      const locationTID = await selectLocation(ticketHistory);
      if (locationTID) await addEquipment(locationTID);
    }
    return { success: true };
  } catch (err) {
    console.error("[Script Keeper] Autofill error:", err);
    return { success: false, error: err.message };
  }
}
