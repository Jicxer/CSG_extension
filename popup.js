const DEFAULT_MACROS = [
  {
    id: "nff",
    name: "No Fraud Found",
    group: "SAN",
    typeText: "Suspicious Activity Notification",
    subTypeText: "Loitering",
    itemText: "No Fraud Found",
    noteText: "Video reviewed, no fraud found",
    stateText: "Closed"
  },
    {
    id: "autofill",
    name: "Autofill",
    group: "ATM/ITM",
    autofill: true
  },
  {
    id: "nofaults",
    name: "No faults",
    group: "ATM/ITM",
    typeText: "Hardware",
    subTypeText: "Network Notification",
    autoDetectItem: true,
    noteText: "Terminal is up and in service with no faults",
    stateText: "Fixed"
  },
    {
    id: "upandin",
    name: "Up and In Service",
    group: "ATM/ITM",
    typeText: "Hardware",
    subTypeText: "Network Notification",
    autoDetectItem: true,
    noteText: "Terminal is up and in service",
    stateText: "Fixed"
  }
];

document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.sync.get("macros");
  const macros = (stored.macros && stored.macros.length) ? stored.macros : DEFAULT_MACROS;

  const container = document.getElementById("macro-buttons");

  const makeButton = (macro) => {
    const btn = document.createElement("button");
    btn.id = "btn_" + macro.id;
    btn.textContent = macro.name;
    btn.addEventListener("click", () => runMacroInTargetTab(macro));
    return btn;
  };

  const grouped = {};
  const ungrouped = [];
  for (const macro of macros) {
    if (macro.group) {
      (grouped[macro.group] ||= []).push(macro);
    } else {
      ungrouped.push(macro);
    }
  }

  for (const macro of ungrouped) {
    container.appendChild(makeButton(macro));
  }

  for (const [groupName, items] of Object.entries(grouped)) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = groupName;
    details.appendChild(summary);
    for (const macro of items) {
      details.appendChild(makeButton(macro));
    }
    container.appendChild(details);
  }

  document.getElementById("btnSettings").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});

/**
 * Displays a status message in the popup's status bar element.
 * Success messages automatically clear and hide after 4 seconds.
 * @param {string} msg - The message text to display.
 * @param {"success"|"error"|""} type - CSS class applied to the status element.
 */
function showStatus(msg, type) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.className = type;
  if (type === "success") {
    setTimeout(() => {
      el.className = "";
      el.style.display = "none";
    }, 4000);
  }
}

/**
 * Reads the `tabId` query parameter from the popup window's URL.
 * Used as a fallback when the background script cannot determine the target tab.
 * @returns {number|null} The tab ID parsed from the URL, or null if absent/invalid.
 */
function getTargetTabIdFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const idStr = params.get("tabId");
    if (!idStr) return null;
    const id = parseInt(idStr, 10);
    return Number.isNaN(id) ? null : id;
  } catch (e) {
    console.warn("[Script Keeper] Failed to parse tabId from query:", e);
    return null;
  }
}

/**
 * Asks the background service worker for the ID of the most recently active
 * real (non-extension, non-browser) tab. Returns a Promise that resolves
 * to the tab ID or null if none is found.
 * @returns {Promise<number|null>}
 */
function getLastFocusedTicketTabId() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_TARGET_TAB_ID" }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[Script Keeper] Could not get target tab id:", chrome.runtime.lastError);
        resolve(null);
        return;
      }
      resolve(response?.tabId ?? null);
    });
  });
}

/**
 * Entry point for executing a macro. Resolves the target tab (via background
 * script or URL query param), then injects either `runAutofill` or
 * `runTicketMacro` into that tab via chrome.scripting.executeScript.
 * Updates the popup status bar with the outcome.
 * @param {Object} config - The macro configuration object from storage.
 */
async function runMacroInTargetTab(config) {
  showStatus("Running\u2026", "");
  document.getElementById("status").style.display = "block";
  try {
    let tabId = await getLastFocusedTicketTabId();
    if (!tabId) tabId = getTargetTabIdFromQuery();

    if (!tabId) {
      showStatus("No target tab found. Switch to the ticket tab first.", "error");
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: config.autofill ? runAutofill : runTicketMacro,
      args: [config]
    });

    const result = results?.[0]?.result;
    if (result?.success) {
      showStatus("\u2713 " + config.name + " completed.", "success");
    } else {
      showStatus("Macro failed: " + (result?.error || "unknown error"), "error");
    }
  } catch (err) {
    console.error("[Script Keeper] Error injecting macro:", err);
    showStatus("Error: " + err.message, "error");
  }
}

/**
 * Injected into the ticket page to execute a standard macro.
 * Must be entirely self-contained (no closure over popup scope).
 * Steps: opens the Add Note dialog, fills and submits the note, sets
 * the Type/SubType/Item/State dropdowns, then clicks Save.
 * @param {Object} config - Macro config with noteText, typeText, subTypeText,
 *   itemText, stateText, and autoDetectItem flags.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function runTicketMacro(config) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Polls for any of the given CSS selectors until one matches or timeout elapses.
  const waitForSel = async (selectors, timeout = 8000, interval = 150) => {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    const start = Date.now();
    while (Date.now() - start < timeout) {
      for (const sel of list) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      await sleep(interval);
    }
    return null;
  };

  // Waits until the given element is removed from the DOM, used to detect when
  // a modal dialog has been dismissed after submitting a note.
  const waitForGone = async (el, timeout = 8000, interval = 100) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!document.contains(el)) return true;
      await sleep(interval);
    }
    return false; // timed out; proceed anyway
  };

  // Waits until a <select> element is populated with at least one non-empty option,
  // handling cascading dropdowns that load asynchronously after a parent selection.
  const waitForOptions = async (selectEl, timeout = 6000, interval = 150) => {
    if (!selectEl) return;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const nonEmpty = Array.from(selectEl.options).filter((o) => o.value !== "");
      if (nonEmpty.length > 0) return;
      await sleep(interval);
    }
    console.warn("[Script Keeper] waitForOptions timed out for:", selectEl.id || selectEl.name);
  };

  // Locates a <select> element by trying exact ID matches first, then a fuzzy scan
  // of all selects matching any hint against id, name, or associated label text.
  const findSelect = (...hints) => {
    for (const hint of hints) {
      const el = document.getElementById(hint);
      if (el && el.tagName === "SELECT") return el;
    }
    const allSelects = Array.from(document.querySelectorAll("select"));
    for (const s of allSelects) {
      const id = (s.id || "").toLowerCase();
      const name = (s.name || "").toLowerCase();
      const labelEl = s.closest("div")?.querySelector("label");
      const labelText = labelEl ? labelEl.innerText.toLowerCase() : "";
      for (const hint of hints) {
        const h = hint.toLowerCase();
        if (id.includes(h) || name.includes(h) || labelText.includes(h)) return s;
      }
    }
    return null;
  };

  // Sets a <select> value by finding an option whose text matches `text`
  // (exact, case-insensitive) and dispatches a change event so the page reacts.
  const setSelect = (el, text) => {
    if (!el || !text) return false;
    const target = text.trim().toLowerCase();
    for (const opt of el.options) {
      const t = (opt.textContent || opt.innerText || "").trim().toLowerCase();
      if (t === target) {
        el.value = opt.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    console.warn("[Script Keeper] Could not match option:", text);
    return false;
  };

  // Searches a root element for a button/anchor/input whose visible text or value
  // exactly matches `text` (case-insensitive). Returns the element or null.
  const findButtonByText = (root, text) => {
    const target = text.trim().toLowerCase();
    return (
      Array.from(
        root.querySelectorAll("button, a, input[type='button'], input[type='submit']")
      ).find(
        (el) => ((el.textContent || el.value) || "").trim().toLowerCase() === target
      ) || null
    );
  };

  // Unchecks any "contact", "cc", or "resource" recipient checkboxes inside the
  // note dialog root to prevent unintended notifications when submitting notes.
  const uncheckRecipientCheckboxes = (root) => {
    root.querySelectorAll("input[type='checkbox']").forEach((box) => {
      const labelText = (box.closest("label")?.innerText || box.id || "").toLowerCase();
      if (
        (labelText.includes("contact") || labelText.includes("cc") || labelText.includes("resource")) &&
        box.checked
      ) {
        box.checked = false;
        box.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  };

  const itemCategories = {
    "No Withdrawal Activity": [
      "no withdrawals dispatch"
    ],
    "No Transaction Activity": [
      "Notification for ACTMON",
      "Business Rule : No Transactions Activity, Fault Descr : No transaction activity",
      "ATM Processing Transactions",
      "ATM Inactive greater than",
      "ZERO TRANS TERMINAL/8 HOURS",
      "ZERO TRANS TERMINAL/12 HOURS",
      "Status code Description :ZERO TRANS TERMINAL/18 HOURS"
    ],
    "Lost Comms": [
      "comm dispatch",
      "offline",
      "Business Rule : Lost Communication, Fault Descr : Session closed by partner",
      "In Service to Off-Line",
      "CommR Dispatch",
      "Online",
      "Notification for COMMUNICATION FAILURE",
      "(5003, critical)",
      "(113, info)",
      "(5004, suspect)",
      "status='C7'",
      "Terminal Off Line As Of",
      "Terminal Closed As Of",
      "Category: Supervisor Dispatch",
      "Business Rule : Out of Service, Fault Descr : No Load",
      "(30, suspect)",
      "Business Rule : Risk Condition, Fault Descr : Excessive txn reversals",
      "Status code Description :DEVICE IN MAINTENANCE",
      "Terminal in Supervisor As Of",
      "Last Transaction Reversed As Of",
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
      "Notification for DEPOSITORY FAILURE",
      "(2009, critical)",
      "Notification for CK/MICR READER FAILURE for Device",
      "(2211, suspect)",
      "Business Rule : Device Fault, Fault Descr : Envelope printer down",
      "Business Rule : Device Fault, Fault Descr : Document depository down",
      "Business Rule : Printer Paper Other Supply Problems, Fault Descr : Depository low/full",
      "Status code Description :DEPOSITORY LOW/FULL",
      "Status Code Description: USB Scalable Deposit Module 2",
      "Status code Description :DEPOSITORY DOWN",
      "Notification for CASH ACCEPTOR FAILURE",
      "Depositor"
    ],
    "Dispenser": [
      "Dispenser Dispatch",
      "Business Rule : Device Fault, Fault Descr : Cash handler down",
      "Notification for MULTIPLE DISPENSER FAILURE",
      "Business Rule : Device Fault, Fault Descr : Cash handler bill jammed",
      "status='0010'",
      "status='0008'",
      "(46, critical)",
      "(2001, critical)",
      "(2005, critical)",
      "Notification for DIVERT FAILURE",
      "Category: Cash Out Dispatch",
      "Business Rule : Device Fault, Fault Descr : Canister",
      "Business Rule : Device Fault, Fault Descr : Cash hand bills not seen exit",
      "Notification for DISPENSER FAILURE",
      "Status code Description :CASH HANDLER DOWN",
      "Status code Description :CANISTER",
      "Notification for CASH THRESHOLD LIMIT REACHED",
      "CASH HANDLER DOWN",
      "Business Rule : Device Fault, Fault Descr : Cash hand bills not seen at exit"
    ],
    "Printer": [
      "Receipt Printer Dispatch",
      "(2047, critical)",
      "Business Rule : Device Fault, Fault Descr : Cons prt head jam/go busy fail",
      "Business Rule : Device Fault, Fault Descr : Cons prt paper not load or jam",
      "Business Rule : Printer Paper Other Supply Problems, Fault Descr : Consumer printer fault",
      "Business Rule : Device Fault, Fault Descr : Consumer prt paper jam",
      "Status code Description :CONSUMER PRINTER DOWN",
      "CONSUMER PRINTER DOWN",
      "Notification for RECEIPT PRINTER FAILURE"
    ],
    "Card Reader": [
      "Card reader Dispatch",
      "Business Rule : Out of Service, Fault Descr : Card reader fault",
      "Notification for EMV CARD READER FAILURE",
      "(2280, suspect)",
      "(2020, critical)",
      "(2281, critical)",
      "Business Rule : Device Fault, Fault Descr : Card capture bin full",
      "Status code Description :Mult. Card Reader/Writer Warns",
      "Status code Description :CARD READER/WRITER DOWN"
    ],
    "Cassette": [
      "status='0016'",
      "Cassettes of type",
      "(50, critical)"
    ],
    "EPP": [
      "Business Rule : Out of Service, Fault Descr : Encryptor down",
      "Notification for ENCRYPTION FAILURE for Device",
      "Status code Description :ENCRYPTOR DOWN",
      "Category: Encryptor Dispatch"
    ],
    "Anti Skimming": [
      "Business Rule : Out of Service, Fault Descr : Card skimming fraud detected Hard Fault",
      "Category: Security Dispatch",
      "(2031, critical)",
      "Business Rule : Risk Condition, Fault Descr : Card skimming device detected",
      "Status code Description :POSSIBLE SKIMMING DEVICE DETECTED"
    ]
  };

  // Inspects the ticket title and most recent note to auto-detect which item
  // category applies (e.g. "Dispenser", "Lost Comms") based on keyword matching
  // against the itemCategories map. Returns the matched label or null.
  const getLabel = () => {
    const titleEl = document.getElementById("txtTitle");
    const titleValue = titleEl ? titleEl.value.trim().toLowerCase() : "";
    const ticketNotes = Array.from(document.querySelectorAll(".notice_info"));
    const lastNote = ticketNotes.at(-1)?.textContent.trim().toLowerCase() || "";
    for (const [label, keywords] of Object.entries(itemCategories)) {
      for (const keyword of keywords) {
        if (titleValue.includes(keyword.toLowerCase()) || lastNote.includes(keyword.toLowerCase())) {
          return label;
        }
      }
    }
    return null;
  };

  // Clicks the "Add Note" button on the ticket page, then waits for the note
  // editor to appear — supports both plain <textarea> and ProseMirror
  // (contenteditable div). Returns the editor element and its modal/dialog root.
  // Throws if either element cannot be found.
  const openNoteDialog = async () => {
    const addNoteButton =
      document.getElementById("aAddNotes") ||
      Array.from(document.querySelectorAll("a,button")).find((el) => {
        const txt = (el.textContent || "").trim().toLowerCase();
        return txt === "add new" || txt === "add note" || txt === "add/send note";
      }) ||
      null;

    if (!addNoteButton) throw new Error("Add Note button not found");
    addNoteButton.click();

    const noteArea = await waitForSel([
      "#txtNoteDescription",
      "textarea#txtNoteDescription",
      "textarea[id*='NoteDescription']",
      "textarea[name*='Note']",
      ".ProseMirror[contenteditable='true']",
      "div[contenteditable='true']"
    ]);
    if (!noteArea) throw new Error("Note text area not found");

    const modalRoot = noteArea.closest(".modal") || noteArea.closest(".ui-dialog") || document;
    return { noteArea, modalRoot };
  };

  // Unchecks recipient checkboxes, sets the note text, then clicks Submit and
  // waits for the dialog to close. Handles both plain <textarea> and ProseMirror
  // (contenteditable div) editors: textareas use .value + events; ProseMirror
  // uses focus + selectAll + execCommand('insertText') so the editor's own
  // transaction system processes the change correctly.
  const fillAndSubmitNote = async (noteArea, modalRoot) => {
    uncheckRecipientCheckboxes(modalRoot);

    if (config.noteText) {
      if (noteArea.tagName === "TEXTAREA") {
        noteArea.value = config.noteText;
        noteArea.dispatchEvent(new Event("input", { bubbles: true }));
        noteArea.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        // ProseMirror contenteditable — must go through execCommand so the
        // editor's internal state stays in sync with the DOM.
        noteArea.focus();
        noteArea.innerText = config.noteText;
        noteArea.dispatchEvent(new Event("input", { bubbles: true }));
        noteArea.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    const submitBtn = findButtonByText(modalRoot, "submit");
    if (submitBtn) {
      submitBtn.click();
      await waitForGone(noteArea);
    } else {
      console.warn("[Script Keeper] Submit button not found in note dialog.");
    }
  };

  // Sets the Type, SubType, Item, and State dropdowns on the ticket form.
  // Waits for cascading dropdowns to populate before setting each value.
  // Uses autoDetectItem to derive the Item value from the ticket title/notes if needed.
  const setDropdowns = async () => {
    const typeSelect = findSelect("ddlType", "type");
    if (!typeSelect) { console.warn("[Script Keeper] Type dropdown not found."); return; }
    setSelect(typeSelect, config.typeText);

    const subTypeSelect = findSelect("ddlSubType", "subtype", "sub-type", "sub type");
    if (!subTypeSelect) { console.warn("[Script Keeper] Sub-Type dropdown not found."); return; }
    await waitForOptions(subTypeSelect);
    setSelect(subTypeSelect, config.subTypeText);

    const itemSelect = findSelect("ddlSubTypeItem", "item");
    if (!itemSelect) { console.warn("[Script Keeper] Item dropdown not found."); return; }
    await waitForOptions(itemSelect);
    const itemText = config.autoDetectItem ? getLabel() : config.itemText;
    if (itemText) {
      setSelect(itemSelect, itemText);
    } else {
      console.warn("[Script Keeper] Could not auto-detect item from ticket title/notes.");
    }

    if (config.stateText) {
      const stateSelect = findSelect("ddlStatus", "status", "state");
      if (stateSelect) {
        setSelect(stateSelect, config.stateText);
      } else {
        console.warn("[Script Keeper] State/Status dropdown not found.");
      }
    }
  };

  // Clicks the Save button on the ticket form to persist the macro changes.
  const save = () => {
    const saveBtn =
      findButtonByText(document, "save") ||
      Array.from(document.querySelectorAll("a.btn.btn-primary, button.btn.btn-primary")).find(
        (el) => (el.textContent || "").trim().toLowerCase() === "save"
      ) ||
      null;

    if (saveBtn) {
      saveBtn.click();
    } else {
      console.warn("[Script Keeper] Save button not found.");
    }
  };

  try {
    console.log("[Script Keeper] Running macro:", config?.name);
    const { noteArea, modalRoot } = await openNoteDialog();
    await fillAndSubmitNote(noteArea, modalRoot);
    await setDropdowns();
    save();
    return { success: true };
  } catch (err) {
    console.error("[Script Keeper] Macro error:", err);
    return { success: false, error: err.message };
  }
}

//=============================================================================Auto Fill functionality=============================================================================\\
/**
 * Injected into the ticket page to automatically populate ticket fields.
 * Must be entirely self-contained (no closure over popup scope).
 * Steps: extracts the Terminal ID from the title, fetches ticket history to
 * determine the correct company and location, then sets status to In Progress,
 * updates Type/SubType/Item dropdowns, selects the matching location, and
 * associates the correct equipment record.
 * @returns {Promise<{success: boolean, error?: string}>}
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

  // Polls until a table matching `selector` has at least one row with `minCells`
  // columns, ensuring the equipment table has fully loaded before row selection.
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

  // Finds a <select> option whose text matches `label` (case-insensitive).
  // Returns the option element or null if not found.
  const findOption = (dropdown, label) => {
    return Array.from(dropdown.options).find(
      (opt) => opt.textContent.trim().toLowerCase() === label.toLowerCase()
    ) || null;
  };

  // Returns the most frequently occurring value of `prop` across an array of objects,
  // along with its count. Used to determine the most common CustomerName or Location
  // from ticket history to pre-select the correct dropdown option.
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

  // Attempts to extract a 6–8 character Terminal ID from a ticket title string
  // by trying each regex in `tidRegexes` in order. Returns the first match or null.
  const extractTID = (title) => {
    for (const re of tidRegexes) {
      const m = title.match(re);
      if (m && m[1]) return m[1];
    }
    return null;
  };

  // Fetches the 50 most recent tickets matching the given Terminal ID from the
  // dashboard API. Returns an array of simplified ticket objects or null on failure.
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
        if (titleValue.includes(keyword.toLowerCase()) || lastNote.includes(keyword.toLowerCase())) {
          return label;
        }
      }
    }
    return null;
  };

  // Sets the ticket Status dropdown to "In Progress" to indicate work has begun.
  const setStatusToInProgress = async () => {
    const statusDropDown = await waitForSel("#ddlStatus");
    if (!statusDropDown) { console.warn("[Script Keeper] Status dropdown not found."); return; }
    const opt = findOption(statusDropDown, "in progress");
    if (opt) statusDropDown.value = opt.value;
  };

  // If the ticket is on the ATM/ITM board, automatically sets Type to "Hardware"
  // and SubType to "Network Notification" as the standard categorization.
  const autoChangeType = async () => {
    const boardDropDown = await waitForSel("#ddlBoard");
    if (!boardDropDown) return;
    const atmOpt = findOption(boardDropDown, "atm/itm");
    if (!atmOpt || boardDropDown.value !== atmOpt.value) {
      console.log("[Script Keeper] Not on ATM/ITM board, skipping autoChangeType.");
      return;
    }
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

  // Auto-detects the Item category from the ticket title/notes and sets the
  // SubTypeItem dropdown accordingly.
  const selectItem = async () => {
    const itemDropDown = await waitForSel("#ddlSubTypeItem");
    if (!itemDropDown) { console.warn("[Script Keeper] Item dropdown not found."); return; }
    const label = getLabel();
    if (!label) { console.warn("[Script Keeper] Could not detect item label from title/notes."); return; }
    const opt = findOption(itemDropDown, label);
    if (opt) itemDropDown.value = opt.value;
  };

  // Selects the most frequently occurring CustomerName from ticket history in the
  // company dropdown. Falls back to "Cook Solutions Group" if history is unavailable.
  // Skips if a non-default company is already selected.
  // @returns {boolean} True if the company was changed (triggers location selection).
  const selectCompany = async (companyDropDown, ticketHistory) => {
    if (companyDropDown.options.length <= 2) return false;
    const bomOpt = findOption(companyDropDown, "West Michigan Credit Union");
    if (companyDropDown.selectedIndex !== 0 && companyDropDown.value !== bomOpt?.value) {
      console.log("[Script Keeper] Company already selected, skipping.");
      return false;
    }
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

  // Waits for the location dropdown to populate, then selects the location whose
  // value is contained in the most frequent Location from ticket history.
  // Returns an object with the selected location's Terminal ID subtitle, or null.
  const selectLocation = async (ticketHistory) => {
    const locationDropDown = await waitForSel("#ddlLocation");
    if (!locationDropDown) { console.warn("[Script Keeper] Location dropdown not found."); return null; }

    const start = Date.now();
    while (locationDropDown.options.length <= 1 && Date.now() - start < 10000) {
      await sleep(500);
    }
    if (locationDropDown.options.length <= 1) {
      console.warn("[Script Keeper] Location dropdown did not populate.");
      return null;
    }

    const best = mostFrequentValue(ticketHistory, "Location");
    const matched = Array.from(locationDropDown.options).find(
      (opt) => best.value && best.value.includes(opt.value)
    );
    if (!matched) { console.warn("[Script Keeper] No matching location found."); return null; }

    locationDropDown.value = matched.value;
    locationDropDown.dispatchEvent(new Event("change", { bubbles: true }));
    return { res: true, TID: matched.dataset?.subtitle3 || "" };
  };

  // Opens the Add Equipment dialog, waits for the equipment table to load, finds
  // the row whose terminal ID matches the location TID, selects its checkbox,
  // then clicks "Associated Equipment" to link it to the ticket.
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

    if (matchedRow) {
      matchedRow.querySelector("td:first-child input")?.click();
    } else {
      console.warn("[Script Keeper] No matching equipment row found.");
    }

    const associateBtn =
      document.getElementById("btnAssociatedEquipment") ||
      Array.from(document.querySelectorAll("a, button")).find((el) =>
        (el.textContent || "").trim().toLowerCase().includes("associated equipment")
      ) || null;

    if (associateBtn) associateBtn.click();
    else console.warn("[Script Keeper] Associate Equipment button not found.");
  };

  try {
    console.log("[Script Keeper] Running autofill");
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
