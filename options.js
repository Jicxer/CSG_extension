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
    id: "atm",
    name: "ATM/ITM",
    group: "ATM/ITM",
    typeText: "Hardware",
    subTypeText: "Network Notification",
    autoDetectItem: true,
    noteText: "Terminal is up and in service with no faults",
    stateText: "Fixed and Closed"
  },
  {
    id: "autofill",
    name: "Autofill",
    group: "ATM",
    autofill: true
  }
];

let macros = [];

// --- Storage helpers ---

/**
 * Loads macros from chrome.storage.sync into the in-memory `macros` array.
 * Falls back to DEFAULT_MACROS if nothing is stored yet, then renders the table.
 */
async function loadMacros() {
  const stored = await chrome.storage.sync.get("macros");
  macros = (stored.macros && stored.macros.length) ? stored.macros : [...DEFAULT_MACROS];
  renderTable();
}

/**
 * Persists the current in-memory `macros` array to chrome.storage.sync.
 * @returns {Promise<void>}
 */
function saveMacros() {
  return chrome.storage.sync.set({ macros });
}

// --- Table rendering ---

/**
 * Escapes a string for safe insertion into HTML, converting &, <, >, and "
 * to their corresponding HTML entities.
 * @param {string} str - The raw string to escape.
 * @returns {string} The HTML-safe string.
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Re-renders the macro list table from the current `macros` array.
 * Displays a placeholder row when there are no macros.
 */
function renderTable() {
  const tbody = document.getElementById("macroList");
  tbody.innerHTML = "";
  if (!macros.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">No macros. Add one below.</td></tr>';
    return;
  }
  macros.forEach((m, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escHtml(m.name)}</td>
      <td>${escHtml(m.group || "")}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(m.noteText || "")}</td>
      <td>${escHtml(m.typeText || "")}</td>
      <td>${escHtml(m.subTypeText || "")}</td>
      <td>${escHtml(m.itemText || (m.autoDetectItem ? "(auto)" : ""))}</td>
      <td>${escHtml(m.stateText || "")}</td>
      <td>
        <button class="btn-sm btn-edit"   data-action="edit"   data-i="${i}">Edit</button>
        <button class="btn-sm btn-delete" data-action="delete" data-i="${i}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Event delegation for Edit / Delete buttons in the table
document.getElementById("macroList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const i = parseInt(btn.dataset.i, 10);
  if (btn.dataset.action === "edit")   populateForm(i);
  if (btn.dataset.action === "delete") deleteMacro(i);
});

// --- Form helpers ---

/**
 * Populates the edit form with data from an existing macro so it can be updated.
 * Locks the ID field (IDs should not change on edit) and updates the form title/button labels.
 * @param {number} i - Index of the macro in the `macros` array to edit.
 */
function populateForm(i) {
  const m = macros[i];
  document.getElementById("editIndex").value = i;
  document.getElementById("fId").value       = m.id       || "";
  document.getElementById("fName").value     = m.name     || "";
  document.getElementById("fGroup").value    = m.group    || "";
  document.getElementById("fNoteText").value = m.noteText || "";
  document.getElementById("fTypeText").value     = m.typeText    || "";
  document.getElementById("fSubTypeText").value  = m.subTypeText || "";
  document.getElementById("fItemText").value     = m.itemText    || "";
  document.getElementById("fStateText").value    = m.stateText   || "";
  document.getElementById("fId").disabled = true; // id shouldn't change on edit
  document.getElementById("formTitle").textContent = "Edit Macro";
  document.getElementById("btnSave").textContent   = "Update Macro";
  document.getElementById("macroForm").scrollIntoView({ behavior: "smooth" });
}

/**
 * Resets the macro form to "Add" mode: clears all fields, re-enables the ID
 * field, and restores the default form title and button labels.
 */
function clearForm() {
  document.getElementById("editIndex").value = "-1";
  document.getElementById("macroForm").reset();
  document.getElementById("fId").disabled = false;
  document.getElementById("formTitle").textContent = "Add Macro";
  document.getElementById("btnSave").textContent   = "Save Macro";
}

// --- CRUD ---

/**
 * Prompts the user for confirmation, then removes the macro at index `i`
 * from the array, saves to storage, re-renders the table, and shows a status message.
 * @param {number} i - Index of the macro to delete.
 */
async function deleteMacro(i) {
  if (!confirm(`Delete macro "${macros[i].name}"?`)) return;
  macros.splice(i, 1);
  await saveMacros();
  renderTable();
  clearForm();
  showStatus("Macro deleted.", "success");
}

document.getElementById("macroForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const idx = parseInt(document.getElementById("editIndex").value, 10);

  const entry = {
    id:          document.getElementById("fId").value.trim(),
    name:        document.getElementById("fName").value.trim(),
    group:       document.getElementById("fGroup").value.trim(),
    noteText:    document.getElementById("fNoteText").value.trim(),
    typeText:    document.getElementById("fTypeText").value.trim(),
    subTypeText: document.getElementById("fSubTypeText").value.trim(),
    itemText:    document.getElementById("fItemText").value.trim(),
    stateText:   document.getElementById("fStateText").value.trim()
  };

  if (idx === -1) {
    // Adding new — check for duplicate id
    if (macros.find((m) => m.id === entry.id)) {
      showStatus(`ID "${entry.id}" already exists. Choose a different ID.`, "error");
      return;
    }
    macros.push(entry);
  } else {
    macros[idx] = { ...macros[idx], ...entry };
  }

  await saveMacros();
  renderTable();
  clearForm();
  showStatus(idx === -1 ? "Macro added." : "Macro updated.", "success");
});

document.getElementById("btnCancel").addEventListener("click", clearForm);

document.getElementById("btnReset").addEventListener("click", async () => {
  if (!confirm("Reset all macros to defaults? Your custom macros will be lost.")) return;
  macros = [...DEFAULT_MACROS];
  await saveMacros();
  renderTable();
  clearForm();
  showStatus("Reset to defaults.", "success");
});

// --- Status bar ---

/**
 * Displays a status message in the status bar element.
 * Success messages automatically clear after 4 seconds.
 * @param {string} msg - The message text to display.
 * @param {"success"|"error"|""} type - CSS class applied to the status element.
 */
function showStatus(msg, type) {
  const el = document.getElementById("statusMsg");
  el.textContent = msg;
  el.className = type;
  if (type === "success") {
    setTimeout(() => { el.className = ""; el.style.display = "none"; }, 4000);
  }
}

// --- Init ---

document.addEventListener("DOMContentLoaded", loadMacros);
