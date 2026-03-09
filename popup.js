const DEFAULT_MACROS = [
  {
    id: "nff",
    name: "No Fraud Found",
    typeValue: "75",
    typeText: "Suspicious Activity Notification",
    subTypeValue: "123",
    subTypeText: "Loitering",
    itemValue: "136",
    itemText: "No Fraud Found",
    noteText: "Video reviewed, no fraud found",
    stateValue: "",
    stateText: "Closed"
  },
  {
    id: "nw",
    name: "No Withdrawal Activity",
    typeValue: "73",
    typeText: "Hardware",
    subTypeValue: "114",
    subTypeText: "Network Notification",
    itemValue: "447",
    itemText: "No Withdrawal Activity",
    noteText: "Terminal is up and in service with no faults",
    stateValue: "162",
    stateText: "Fixed and Closed"
  },
  {
    id: "lc",
    name: "Lost Comms",
    typeValue: "73",
    typeText: "Hardware",
    subTypeValue: "114",
    subTypeText: "Network Notification",
    itemValue: "304",
    itemText: "Lost Comms",
    noteText: "Terminal is up and in service with no faults",
    stateValue: "162",
    stateText: "Fixed and Closed"
  },
  {
    id: "na",
    name: "No Transaction Activity",
    typeValue: "73",
    typeText: "Hardware",
    subTypeValue: "114",
    subTypeText: "Network Notification",
    itemValue: "448",
    itemText: "No Transaction Activity",
    noteText: "Terminal is up and in service with no faults",
    stateValue: "162",
    stateText: "Fixed and Closed"
  }
];

document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.sync.get("macros");
  const macros = (stored.macros && stored.macros.length) ? stored.macros : DEFAULT_MACROS;

  const container = document.getElementById("macro-buttons");
  for (const macro of macros) {
    const btn = document.createElement("button");
    btn.id = "btn_" + macro.id;
    btn.textContent = macro.name;
    btn.addEventListener("click", () => runMacroInTargetTab(macro));
    container.appendChild(btn);
  }

  document.getElementById("btnSettings").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});

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
      func: runTicketMacro,
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

// Runs in the context of the ticket page — must be entirely self-contained.
async function runTicketMacro(config) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // Wait until an element is removed from the DOM (modal close detection).
  const waitForGone = async (el, timeout = 8000, interval = 100) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!document.contains(el)) return true;
      await sleep(interval);
    }
    return false; // timed out; proceed anyway
  };

  // Wait until a <select> has at least one non-empty option (cascade load detection).
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

  // Find a <select> by exact ID first, then fall back to scanning by id/name/label.
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

  // Set a <select> by value (preferred) or by matching option text.
  const setSelect = (el, value, text) => {
    if (!el) return false;
    if (value != null && value !== "") {
      for (const opt of el.options) {
        if (opt.value === value) {
          el.value = value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
    }
    if (text) {
      const target = text.trim().toLowerCase();
      for (const opt of el.options) {
        const t = (opt.textContent || opt.innerText || "").trim().toLowerCase();
        if (t.includes(target)) {
          el.value = opt.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
    }
    console.warn("[Script Keeper] Could not match option:", text || value);
    return false;
  };

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

  try {
    console.log("[Script Keeper] Running macro:", config?.name);

    // 1) Open Add Note dialog
    const addNoteButton =
      document.getElementById("aAddNotes") ||
      Array.from(document.querySelectorAll("a,button")).find((el) => {
        const txt = (el.textContent || "").trim().toLowerCase();
        return txt === "add new" || txt === "add note" || txt === "add/send note";
      }) ||
      null;

    if (!addNoteButton) return { success: false, error: "Add Note button not found" };
    addNoteButton.click();

    // 2) Wait for note text area
    const noteArea = await waitForSel([
      "#txtNoteDescription",
      "textarea#txtNoteDescription",
      "textarea[id*='NoteDescription']",
      "textarea[name*='Note']"
    ]);
    if (!noteArea) return { success: false, error: "Note text area not found" };

    const modalRoot = noteArea.closest(".modal") || noteArea.closest(".ui-dialog") || document;

    // 3) Uncheck recipient checkboxes
    uncheckRecipientCheckboxes(modalRoot);

    // 4) Fill note text
    if (config.noteText) {
      noteArea.value = config.noteText;
      noteArea.dispatchEvent(new Event("input", { bubbles: true }));
      noteArea.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // 5) Submit note and wait for modal to close instead of a fixed delay
    const submitBtn = findButtonByText(modalRoot, "submit");
    if (submitBtn) {
      submitBtn.click();
      await waitForGone(noteArea);
    } else {
      console.warn("[Script Keeper] Submit button not found in note dialog.");
    }

    // 6) Set Type, then wait for Sub-Type cascade, then wait for Item cascade
    const typeSelect = findSelect("ddlType", "type");
    if (typeSelect) {
      setSelect(typeSelect, config.typeValue, config.typeText);

      const subTypeSelect = findSelect("ddlSubType", "subtype", "sub-type", "sub type");
      if (subTypeSelect) {
        await waitForOptions(subTypeSelect);
        setSelect(subTypeSelect, config.subTypeValue, config.subTypeText);

        const itemSelect = findSelect("ddlSubTypeItem", "item");
        if (itemSelect) {
          await waitForOptions(itemSelect);
          setSelect(itemSelect, config.itemValue, config.itemText);
        } else {
          console.warn("[Script Keeper] Item dropdown not found.");
        }
      } else {
        console.warn("[Script Keeper] Sub-Type dropdown not found.");
      }
    } else {
      console.warn("[Script Keeper] Type dropdown not found.");
    }

    // 7) Set State/Status dropdown
    if (config.stateText || config.stateValue) {
      const stateSelect = findSelect("ddlStatus", "status", "state");
      if (stateSelect) {
        setSelect(stateSelect, config.stateValue || "", config.stateText || "");
      } else {
        console.warn("[Script Keeper] State/Status dropdown not found.");
      }
    }

    // 8) Save
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

    return { success: true };
  } catch (err) {
    console.error("[Script Keeper] Macro error:", err);
    return { success: false, error: err.message };
  }
}
