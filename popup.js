document.addEventListener("DOMContentLoaded", () => {
  const macroConfigs = {
    nff: {
      name: "No Fraud Found",
      typeValue: "75",
      typeText: "Suspicious Activity Notification",
      subTypeValue: "123",
      subTypeText: "Loitering",
      itemValue: "136",
      itemText: "No Fraud Found",
      noteText:
        "The video has been reviewed. No fraud has been found. No further action has been taken.",
      stateText: "Closed"
    },
    nw: {
      name: "No Withdrawal Activity",
      typeValue: "73",
      typeText: "Hardware",
      subTypeValue: "114",
      subTypeText: "Network Notification",
      itemValue: "447",
      itemText: "No Withdrawal Activity",
      noteText: "Terminal is up and in service with no faults",
      stateText: "Closed"
    },
    lc: {
      name: "Lost Comms",
      typeValue: "73",
      typeText: "Hardware",
      subTypeValue: "114",
      subTypeText: "Network Notification",
      itemValue: "304",
      itemText: "Lost Comms",
      noteText: "Terminal is up and in service with no faults",
      stateText: "Closed"
    },
    na: {
      name: "No Transaction Activity",
      typeValue: "73",
      typeText: "Hardware",
      subTypeValue: "114",
      subTypeText: "Network Notification",
      itemValue: "448",
      itemText: "No Transaction Activity",
      noteText: "Terminal is up and in service with no faults",
      stateText: "Closed"
    }
  };

  setupButton("btnNFF", macroConfigs.nff);
  setupButton("btnNW", macroConfigs.nw);
  setupButton("btnLC", macroConfigs.lc);
  setupButton("btnNA", macroConfigs.na);
});

function setupButton(id, config) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener("click", () => runMacroInTargetTab(config));
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
      resolve(response && response.tabId ? response.tabId : null);
    });
  });
}

async function runMacroInTargetTab(config) {
  try {
    let tabId = await getLastFocusedTicketTabId();
    if (!tabId) tabId = getTargetTabIdFromQuery();

    if (!tabId) {
      alert(
        "Script Keeper couldn't determine which ticket tab to use.\n\n" +
          "Switch to the ticket tab you want, then click a macro again."
      );
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      func: runTicketMacro,
      args: [config]
    });
  } catch (err) {
    console.error("Error injecting macro:", err);
    alert("Error running macro: " + err.message);
  }
}

// ----------------------------------------------------
// Runs inside the ticket page
// ----------------------------------------------------
async function runTicketMacro(config) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
        if (v) {
          obs.disconnect();
          resolve(v);
        }
      });

      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

      setTimeout(() => {
        obs.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  };

  const findButtonByText = (root, text) => {
    const target = (text || "").trim().toLowerCase();
    const candidates = root.querySelectorAll("button, a, input[type='button'], input[type='submit']");
    for (const el of candidates) {
      const label = ((el.textContent || el.value) || "").trim().toLowerCase();
      if (label === target) return el;
    }
    return null;
  };

  const findButtonContains = (root, text) => {
    const target = (text || "").trim().toLowerCase();
    const candidates = root.querySelectorAll("button, a, input[type='button'], input[type='submit']");
    for (const el of candidates) {
      const label = ((el.textContent || el.value) || "").trim().toLowerCase();
      if (label.includes(target)) return el;
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
        const optText = (opt.textContent || opt.innerText || "").trim().toLowerCase();
        if (optText === target || optText.includes(target)) {
          selectEl.value = opt.value;
          selectEl.dispatchEvent(new Event("change", { bubbles: true }));
          return;
        }
      }
    }
  };

  // -----------------------------
  // Overlay logic (fast, stable)
  // -----------------------------
  const getTopOverlay = () => {
    const filePreview = document.querySelector("#FilePreviewModal");
    if (filePreview && isVisible(filePreview)) return filePreview;

    const mfp = document.querySelector(".mfp-wrap.mfp-ready");
    if (mfp && isVisible(mfp)) return mfp;

    const bs = Array.from(document.querySelectorAll(".modal.show, .modal.fade.in")).find(isVisible);
    if (bs) return bs;

    return null;
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

    // Instead of waiting for full disappearance, just wait until it stops being visible
    const ok = await waitFor(() => !getTopOverlay(), 2500, 50);
    return !!ok;
  };

  // -----------------------------
  // Notes modal
  // -----------------------------
  const getNotesModalRoot = () => {
    const wrap = document.querySelector(".mfp-wrap.mfp-ready");
    if (wrap && isVisible(wrap)) {
      const content = wrap.querySelector(".mfp-content");
      const add = content ? content.querySelector("#modal-addnote") : null;
      if (add && isVisible(add)) return add;
    }
    const add2 = document.querySelector("#modal-addnote");
    if (add2 && isVisible(add2)) return add2;
    return null;
  };

  const openNotesModalStable = async () => {
    // click once, then wait for modal to appear (mutation-driven)
    const addNoteButton =
      document.getElementById("aAddNotes") ||
      Array.from(document.querySelectorAll("a,button")).find((el) => {
        const txt = (el.textContent || "").trim().toLowerCase();
        return txt === "add new" || txt === "add note" || txt === "add/send note" || txt === "add/send notes";
      }) ||
      null;

    if (!addNoteButton) return null;

    click(addNoteButton);

    // wait for modal root to exist + visible
    const modal =
      (await waitForMutation(() => getNotesModalRoot(), 4500)) ||
      (await waitFor(() => getNotesModalRoot(), 4500, 50));

    return modal;
  };

  // -----------------------------
  // Checkbox uncheck (IDs)
  // -----------------------------
  const forceUncheck = (id) => {
    const cb = document.getElementById(id);
    if (!cb) return false;
    if (cb.checked) {
      click(cb);
      cb.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  };

  const waitCheckboxUnchecked = async (id) => {
    return !!(await waitFor(() => {
      const cb = document.getElementById(id);
      if (!cb) return true; // if it is not present, treat as ok
      return cb.checked === false ? true : null;
    }, 1500, 40));
  };

  // -----------------------------
  // Editor ready + note insert
  // -----------------------------
  const getTextarea = (root) =>
    root.querySelector("#txtNoteDescription") ||
    root.querySelector("textarea#txtNoteDescription") ||
    root.querySelector("textarea[id*='NoteDescription']") ||
    root.querySelector("textarea[name*='Note']");

  const getProseMirror = (root) =>
    root.querySelector("#supportNoteEditor_detailTab .ProseMirror[contenteditable='true']") ||
    root.querySelector(".ProseMirror[contenteditable='true']");

  const waitEditorReady = async (modalRoot) => {
    // textarea path
    const ta =
      (await waitFor(() => {
        const t = getTextarea(modalRoot);
        return (t && isVisible(t)) ? t : null;
      }, 2500, 40));

    if (ta) return { textarea: ta, prose: null };

    // prose path: wait for it to exist AND have height (mounted)
    const pm =
      (await waitFor(() => {
        const p = getProseMirror(modalRoot);
        if (!p) return null;
        const r = p.getBoundingClientRect();
        if (!isVisible(p)) return null;
        if (r.height < 60) return null; // not fully mounted yet
        return p;
      }, 3500, 40));

    if (pm) return { textarea: null, prose: pm };
    return null;
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

    // fallback if execCommand blocked
    if (!((pm.textContent || "").trim().length)) {
      pm.textContent = text;
      pm.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  };

  const waitModalClosed = async () => {
    return !!(await waitFor(() => !getNotesModalRoot(), 5000, 50));
  };

  try {
    console.log("[Script Keeper] Running macro:", config && config.name);

    // 0) close the overlay fast (no huge sleep)
    await closeOverlayFast();

    // 1) Open notes modal (single click + wait for actual the modal)
    const modalRoot = await openNotesModalStable();
    if (!modalRoot) {
      console.warn("[Script Keeper] Notes modal not found.");
      return;
    }

    // 2) Uncheck and VERIFY quickly
    forceUncheck("chkContact");
    forceUncheck("chkResources");
    forceUncheck("chkCC") || forceUncheck("chkCc");

    await Promise.all([
      waitCheckboxUnchecked("chkContact"),
      waitCheckboxUnchecked("chkResources"),
      waitCheckboxUnchecked("chkCC")
    ]);

    // 3) Wait editor mounted, then write note
    const editor = await waitEditorReady(modalRoot);
    if (!editor) {
      console.warn("[Script Keeper] Editor not ready.");
      return;
    }

    if (config.noteText) {
      if (editor.textarea) setTextareaNote(editor.textarea, config.noteText);
      else if (editor.prose) await setProseMirrorNote(editor.prose, config.noteText);
    }

    // 4) Submit and WAIT until modal closes instead of sleeping 1200ms
    const submitBtn = findButtonByText(modalRoot, "submit") || findButtonContains(modalRoot, "submit");
    if (submitBtn) click(submitBtn);
    await waitModalClosed();

    // 5) Dropdowns + state
    const typeSelect = document.getElementById("ddlType");
    if (typeSelect) setSelectByValueOrText(typeSelect, config.typeValue, config.typeText);

    const subTypeSelect = document.getElementById("ddlSubType");
    if (subTypeSelect) setSelectByValueOrText(subTypeSelect, config.subTypeValue, config.subTypeText);

    const itemSelect = document.getElementById("ddlSubTypeItem");
    if (itemSelect) setSelectByValueOrText(itemSelect, config.itemValue, config.itemText);

    if (config.stateText) {
      const stateSelect = document.getElementById("ddlStatus");
      if (stateSelect) setSelectByValueOrText(stateSelect, "", config.stateText);
    }

    // 6) Save
    const saveBtn =
      findButtonByText(document, "save") ||
      Array.from(document.querySelectorAll("a.btn.btn-primary,button.btn.btn-primary")).find(
        (el) => (el.textContent || "").trim().toLowerCase() === "save"
      ) ||
      null;

    if (saveBtn) click(saveBtn);
    else console.warn("[Script Keeper] Save button not found.");
  } catch (err) {
    console.error("[Script Keeper] Macro error:", err);
    alert("Script Keeper macro error: " + err.message);
  }
}
