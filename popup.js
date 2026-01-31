document.addEventListener("DOMContentLoaded", () => {
  const macroConfigs = {
    nff: {
      name: "No Fraud Found",
      // dropdowns after note submit
      typeValue: "75",
      typeText: "Suspicious Activity Notification",
      subTypeValue: "123",
      subTypeText: "Loitering",
      itemValue: "136",
      itemText: "No Fraud Found",
      // note + state
      noteText: "Video reviewed, no fraud found",
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
      stateValue: "162",
      stateText: "Fixed and Closed"
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
      stateValue: "162",
      stateText: "Fixed and Closed"
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
      stateValue: "162",
      stateText: "Fixed and Closed"
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
        console.warn(
          "[Script Keeper] Could not get target tab id:",
          chrome.runtime.lastError
        );
        resolve(null);
        return;
      }
      if (!response || !response.tabId) {
        resolve(null);
      } else {
        resolve(response.tabId);
      }
    });
  });
}

async function runMacroInTargetTab(config) {
  try {
    // Prefer the tab chosen by the background script (last-focused real tab)
    let tabId = await getLastFocusedTicketTabId();

    // Fallback to the legacy query-string method if needed
    if (!tabId) {
      tabId = getTargetTabIdFromQuery();
    }

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

    // NOTE: we intentionally do NOT close the window here
    // so you can run multiple macros in a row.
  } catch (err) {
    console.error("Error injecting macro:", err);
    alert("Error running macro: " + err.message);
  }
}

// This function runs in the context of the ticket page
async function runTicketMacro(config) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitForSel = async (selectors, timeout = 8000, interval = 150) => {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];
    const start = Date.now();
    while (Date.now() - start < timeout) {
      for (const sel of selectorList) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      await sleep(interval);
    }
    return null;
  };

  const clickIfExists = (el) => {
    if (!el) return;
    el.click();
  };

  const setSelectByValueOrText = (selectEl, value, text) => {
    if (!selectEl) return;
    let found = false;

    if (value != null && value !== "") {
      for (const opt of selectEl.options) {
        if (opt.value === value) {
          selectEl.value = value;
          selectEl.dispatchEvent(new Event("change", { bubbles: true }));
          found = true;
          break;
        }
      }
    }

    if (!found && text) {
      const target = text.trim().toLowerCase();
      for (const opt of selectEl.options) {
        const optText = (opt.textContent || opt.innerText || "").trim().toLowerCase();
        if (optText.includes(target)) {
          selectEl.value = opt.value;
          selectEl.dispatchEvent(new Event("change", { bubbles: true }));
          found = true;
          break;
        }
      }
    }

    if (!found) {
      console.warn("[Script Keeper] Could not match option value/text for:", text || value);
    }
  };

  const findButtonByText = (root, text) => {
    const target = text.trim().toLowerCase();
    const candidates = root.querySelectorAll(
      "button, a, input[type='button'], input[type='submit']"
    );
    for (const el of candidates) {
      const label = ((el.textContent || el.value) || "").trim().toLowerCase();
      if (label === target) {
        return el;
      }
    }
    return null;
  };

  const uncheckRecipientCheckboxes = (root) => {
    const boxes = root.querySelectorAll("input[type='checkbox']");
    boxes.forEach((box) => {
      const labelText =
        (box.closest("label") && box.closest("label").innerText) ||
        box.id ||
        "";
      const l = labelText.toLowerCase();
      if (l.includes("contact") || l.includes("cc") || l.includes("resource")) {
        if (box.checked) {
          box.checked = false;
          box.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    });
  };

  try {
    console.log("[Script Keeper] Running macro:", config && config.name);

    // 1) Open Add Note dialog by clicking "Add New"
    let addNoteButton =
      document.getElementById("aAddNotes") ||
      Array.from(document.querySelectorAll("a,button")).find((el) => {
        const txt = (el.textContent || "").trim().toLowerCase();
        return txt === "add new" || txt === "add note" || txt === "add/send note";
      }) ||
      null;

    if (!addNoteButton) {
      console.warn("[Script Keeper] Add Note / Add New button not found.");
      return;
    }
    clickIfExists(addNoteButton);

    // 2) Wait for the note text area
    const noteArea = await waitForSel([
      "#txtNoteDescription",
      "textarea#txtNoteDescription",
      "textarea[id*='NoteDescription']",
      "textarea[name*='Note']"
    ]);

    if (!noteArea) {
      console.warn("[Script Keeper] Note area not found.");
      return;
    }

    const modalRoot =
      noteArea.closest(".modal") ||
      noteArea.closest(".ui-dialog") ||
      document;

    // 3) Uncheck Contact / Cc / Resources checkboxes if present
    uncheckRecipientCheckboxes(modalRoot);

    // 4) Fill the note text
    if (config.noteText) {
      noteArea.value = config.noteText;
      noteArea.dispatchEvent(new Event("input", { bubbles: true }));
      noteArea.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // 5) Click Submit on the note dialog
    const submitBtn = findButtonByText(modalRoot, "submit");
    if (submitBtn) {
      clickIfExists(submitBtn);
      await sleep(1000);
    } else {
      console.warn("[Script Keeper] Submit button not found in note dialog.");
    }

    // 6) After note: set Type, Sub-Type, Item dropdowns
    // Type
    let typeSelect = document.getElementById("ddlType");
    if (!typeSelect) {
      const allSelects = Array.from(document.querySelectorAll("select"));
      typeSelect =
        allSelects.find((s) => {
          const id = (s.id || "").toLowerCase();
          const name = (s.name || "").toLowerCase();
          const label =
            (s.closest("div") && s.closest("div").querySelector("label")) ||
            null;
          const labelText = label ? label.innerText.toLowerCase() : "";
          return (
            id.includes("type") ||
            name.includes("type") ||
            labelText.includes("type")
          );
        }) || null;
    }
    if (typeSelect) {
      setSelectByValueOrText(typeSelect, config.typeValue, config.typeText);
    } else {
      console.warn("[Script Keeper] Type dropdown not found.");
    }

    // Sub-Type
    let subTypeSelect = document.getElementById("ddlSubType");
    if (!subTypeSelect) {
      const allSelects = Array.from(document.querySelectorAll("select"));
      subTypeSelect =
        allSelects.find((s) => {
          const id = (s.id || "").toLowerCase();
          const name = (s.name || "").toLowerCase();
          const label =
            (s.closest("div") && s.closest("div").querySelector("label")) ||
            null;
          const labelText = label ? label.innerText.toLowerCase() : "";
          return (
            id.includes("subtype") ||
            name.includes("subtype") ||
            labelText.includes("sub-type") ||
            labelText.includes("sub type")
          );
        }) || null;
    }
    if (subTypeSelect) {
      setSelectByValueOrText(subTypeSelect, config.subTypeValue, config.subTypeText);
    } else {
      console.warn("[Script Keeper] Sub-Type dropdown not found.");
    }

    // Item
    let itemSelect = document.getElementById("ddlSubTypeItem");
    if (!itemSelect) {
      const allSelects = Array.from(document.querySelectorAll("select"));
      itemSelect =
        allSelects.find((s) => {
          const id = (s.id || "").toLowerCase();
          const name = (s.name || "").toLowerCase();
          const label =
            (s.closest("div") && s.closest("div").querySelector("label")) ||
            null;
          const labelText = label ? label.innerText.toLowerCase() : "";
          return (
            id.includes("item") ||
            name.includes("item") ||
            labelText.includes("item")
          );
        }) || null;
    }
    if (itemSelect) {
      setSelectByValueOrText(itemSelect, config.itemValue, config.itemText);
    } else {
      console.warn("[Script Keeper] Item dropdown not found.");
    }

    // 7) Set State / Status dropdown
    if (config.stateText || config.stateValue) {
      let stateSelect = document.getElementById("ddlStatus");
      if (!stateSelect) {
        const allSelects = Array.from(document.querySelectorAll("select"));
        stateSelect =
          allSelects.find((s) => {
            const id = (s.id || "").toLowerCase();
            const name = (s.name || "").toLowerCase();
            const label =
              (s.closest("div") && s.closest("div").querySelector("label")) ||
              null;
            const labelText = label ? label.innerText.toLowerCase() : "";
            return (
              id.includes("status") ||
              id.includes("state") ||
              name.includes("status") ||
              name.includes("state") ||
              labelText.includes("status") ||
              labelText.includes("state")
            );
          }) || null;
      }
      if (stateSelect) {
        setSelectByValueOrText(
          stateSelect,
          config.stateValue || "",
          config.stateText || ""
        );
      } else {
        console.warn("[Script Keeper] State/Status dropdown not found.");
      }
    }

    // 8) Click Save button on the ticket
    const saveBtn =
      findButtonByText(document, "save") ||
      Array.from(
        document.querySelectorAll("a.btn.btn-primary,button.btn.btn-primary")
      ).find((el) => ((el.textContent || "").trim().toLowerCase() === "save")) ||
      null;

    if (saveBtn) {
      clickIfExists(saveBtn);
    } else {
      console.warn("[Script Keeper] Save button not found.");
    }
  } catch (err) {
    console.error("[Script Keeper] Macro error:", err);
    alert("Script Keeper macro error: " + err.message);
  }
}
