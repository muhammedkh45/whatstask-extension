const views = {
  default: document.getElementById("state-default"),
  loading: document.getElementById("state-loading"),
  settings: document.getElementById("state-settings"),
  error: document.getElementById("state-error"),
};

const icons = {
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.36a1.7 1.7 0 0 0-1 .64l-.03.05a2 2 0 1 1-3.94 0L10 20a1.7 1.7 0 0 0-1-.64 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-.64-1l-.05-.03a2 2 0 1 1 0-3.94L4 10a1.7 1.7 0 0 0 .64-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1-.64l.03-.05a2 2 0 1 1 3.94 0L14 4a1.7 1.7 0 0 0 1 .64 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9c.1.38.32.72.64 1l.05.03a2 2 0 1 1 0 3.94L20 14c-.32.28-.54.62-.64 1Z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12l2 2 4-5"/><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  pick: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
};

const pickBtn = document.getElementById("pickBtn");
const settingsBtn = document.getElementById("settings-btn");
const themeBtn = document.getElementById("theme-btn");
const pickMsgBtn = document.getElementById("pick-msg-btn");
const retryBtn = document.getElementById("retry-btn");
const detectedList = document.getElementById("detected-list");
const settingsStatus = document.getElementById("settings-status");
const toastRoot = document.getElementById("toast-root");

let currentResult = null;
let currentText = null;
let currentMessageDate = null;
let currentChatName = null;
let activeFilter = "all";
let detectedItems = [];

function switchView(viewName) {
  Object.values(views).forEach((el) => el.classList.add("hidden"));
  views[viewName]?.classList.remove("hidden");
}

window.addEventListener("DOMContentLoaded", initialize);
themeBtn.addEventListener("click", toggleTheme);
settingsBtn.addEventListener("click", openSettings);
pickBtn.addEventListener("click", startPicker);
pickMsgBtn.addEventListener("click", startPicker);
retryBtn.addEventListener("click", () => {
  if (currentText) analyzeCurrentMessage();
  else loadHome();
});

document.querySelectorAll(".filter-pill").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".filter-pill").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    renderDetectedItems();
  });
});

document.getElementById("connect-google-btn").addEventListener("click", loadGoogleOptions);
document.getElementById("reconnect-google-btn").addEventListener("click", reconnectGoogle);
document.getElementById("save-settings-btn").addEventListener("click", saveSettings);
document.getElementById("back-settings-btn").addEventListener("click", loadHome);
document.getElementById("save-api-key-btn").addEventListener("click", async () => {
  const keyInput = document.getElementById("user-gemini-key");
  const key = keyInput.value.trim();
  await sendRuntimeMessage({ action: "saveUserApiKeys", keys: { geminiKey: key } });
  showToast(key ? "API key saved" : "API key removed", "success");
});

// Load user API key when settings view opens
const origSettingsClick = document.getElementById("settings-btn").onclick;
document.getElementById("settings-btn").addEventListener("click", async () => {
  setTimeout(async () => {
    const res = await sendRuntimeMessage({ action: "getUserApiKeys" }).catch(() => ({}));
    const keyInput = document.getElementById("user-gemini-key");
    if (keyInput && res?.keys?.geminiKey) keyInput.value = res.keys.geminiKey;
  }, 100);
});

async function initialize() {
  await applyStoredTheme();
  settingsBtn.innerHTML = icons.settings;
  pickMsgBtn.innerHTML = icons.pick;
  const storage = await chrome.storage.local.get(["pendingText", "pendingDate", "pendingChatName", "history"]);

  if (storage.pendingText) {
    currentText = storage.pendingText;
    currentMessageDate = storage.pendingDate || new Date().toLocaleString();
    currentChatName = storage.pendingChatName || "Unknown Chat";
    await sendRuntimeMessage({ action: "clearPendingMessage" }).catch(() => null);
    detectedItems = historyToItems(storage.history || []);
    analyzeCurrentMessage();
    return;
  }

  detectedItems = historyToItems(storage.history || []);
  renderDetectedItems();
  switchView("default");
}

async function applyStoredTheme() {
  const { uiTheme = "light" } = await chrome.storage.local.get("uiTheme");
  setTheme(uiTheme);
}

async function toggleTheme() {
  const nextTheme = document.body.classList.contains("dark") ? "light" : "dark";
  setTheme(nextTheme);
  await chrome.storage.local.set({ uiTheme: nextTheme });
}

function setTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  themeBtn.innerHTML = theme === "dark" ? icons.sun : icons.moon;
}

function startPicker() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "startPicker" }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        showToast("Open WhatsApp Web first", "error");
        return;
      }
      window.close();
    });
  });
}

async function loadHome() {
  const storage = await chrome.storage.local.get("history");
  detectedItems = currentResult ? [resultToItem(currentResult, currentText, currentChatName, false), ...historyToItems(storage.history || [])] : historyToItems(storage.history || []);
  renderDetectedItems();
  switchView("default");
}

async function analyzeCurrentMessage() {
  views.loading.classList.add("analyzing");
  switchView("loading");

  try {
    const response = await sendRuntimeMessage({
      action: "analyzeMessage",
      text: currentText,
      messageDate: currentMessageDate,
      chatName: currentChatName,
    });
    currentResult = response.result;
    detectedItems = [resultToItem(currentResult, currentText, currentChatName, true), ...detectedItems];
    renderDetectedItems();
    views.loading.classList.remove("analyzing");
    switchView("default");
  } catch (error) {
    views.loading.classList.remove("analyzing");
    showError(error.message || "Failed to analyze message.");
  }
}

function resultToItem(result, message, chatName, isCurrent) {
  const type = normalizeItemType(result.type);
  return {
    id: isCurrent ? "current" : `history-${result.savedAt || Date.now()}`,
    type,
    contact: chatName || "WhatsApp",
    messageSnippet: message || result.originalText || "",
    detectedText: result.title || "Untitled",
    dateTime: formatDateTime(result),
    result: { ...result, type, chatName: chatName || "WhatsApp", originalText: message || "" },
    addedToCalendar: false,
    addedToTasks: false,
  };
}

function historyToItems(history) {
  return (history || []).slice(0, 12).map((item, index) => {
    const targets = Array.isArray(item.savedTo) ? item.savedTo : [item.savedTo];
    const type = normalizeItemType(item.type);
    return {
      id: `history-${item.savedAt || index}`,
      type,
      contact: item.chatName || "WhatsApp",
      messageSnippet: item.originalText || item.notes || "",
      detectedText: item.title || "Untitled",
      dateTime: formatDateTime(item),
      result: { ...item, type },
      addedToCalendar: targets.includes("calendar"),
      addedToTasks: targets.includes("tasks"),
    };
  });
}

function renderDetectedItems() {
  const filtered = detectedItems.filter((item) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "reminder") return item.type === "reminder" || item.type === "deadline";
    return item.type === activeFilter;
  });


  if (!filtered.length) {
    detectedList.innerHTML = `
      <div class="empty-panel">
        <p>No items in this category</p>
        <button class="primary-btn" type="button" data-action="pick">Pick a Message</button>
      </div>
    `;
    detectedList.querySelector("[data-action='pick']").addEventListener("click", startPicker);
    return;
  }

  detectedList.innerHTML = filtered.map(renderItemCard).join("");
  detectedList.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => saveItemTarget(button.dataset.id, button.dataset.action, button));
  });
  detectedList.querySelectorAll(".edit-field").forEach((input) => {
    input.addEventListener("change", () => {
      const item = detectedItems.find((candidate) => candidate.id === input.dataset.id);
      if (!item) return;
      const field = input.dataset.field;
      if (field === "title") {
        item.detectedText = input.value;
        item.result.title = input.value;
      } else if (field === "date") {
        item.result.date = input.value;
      } else if (field === "time") {
        item.result.time = input.value;
      } else if (field === "notes") {
        item.result.notes = input.value;
      }
    });
  });
}

function renderItemCard(item, index) {
  return `
    <article class="detected-card ${escapeAttr(item.type)}" style="--delay:${Math.min(index || 0, 5) * 70}ms">
      <div class="card-header">
        <div>
          <div class="contact-row">
            <span class="contact-name">${escapeHtml(item.contact)}</span>
            <span class="badge ${escapeAttr(item.type)}">${escapeHtml(displayType(item.type))}</span>
          </div>
          <p class="message-snippet">"${escapeHtml(item.messageSnippet || item.detectedText)}"</p>
        </div>
      </div>
      <div class="detected-box">
        <input class="edit-field edit-title" type="text" value="${escapeAttr(item.detectedText)}" data-id="${escapeAttr(item.id)}" data-field="title" placeholder="Title" />
        <div class="edit-row">
          <input class="edit-field edit-date" type="date" value="${escapeAttr(item.result?.date || "")}" data-id="${escapeAttr(item.id)}" data-field="date" />
          <input class="edit-field edit-time" type="time" value="${escapeAttr(item.result?.time || "")}" data-id="${escapeAttr(item.id)}" data-field="time" />
        </div>
        <textarea class="edit-field edit-notes" rows="2" data-id="${escapeAttr(item.id)}" data-field="notes" placeholder="Notes...">${escapeHtml(item.result?.notes || "")}</textarea>
      </div>
      <div class="card-actions">
        <button class="card-action calendar-action ${item.addedToCalendar ? "added" : ""}" type="button" data-action="calendar" data-id="${escapeAttr(item.id)}" ${item.addedToCalendar ? "disabled" : ""}>
          ${item.addedToCalendar ? icons.check : icons.calendar}
          <span>${item.addedToCalendar ? "Added" : "Calendar"}</span>
        </button>
        <button class="card-action tasks-action ${item.addedToTasks ? "added" : ""}" type="button" data-action="tasks" data-id="${escapeAttr(item.id)}" ${item.addedToTasks ? "disabled" : ""}>
          ${item.addedToTasks ? icons.check : icons.tasks}
          <span>${item.addedToTasks ? "Added" : "Tasks"}</span>
        </button>
      </div>
    </article>
  `;
}

async function saveItemTarget(itemId, target, button) {
  const item = detectedItems.find((candidate) => candidate.id === itemId);
  if (!item || item[`addedTo${target === "calendar" ? "Calendar" : "Tasks"}`]) return;

  button.disabled = true;
  button.classList.add("saving");
  button.querySelector("span").textContent = "Saving";

  try {
    const response = await sendRuntimeMessage({
      action: "saveItem",
      result: item.result,
      targets: { calendar: target === "calendar", tasks: target === "tasks" },
    });
    await sendRuntimeMessage({ action: "clearPendingMessage" }).catch(() => null);
    if (target === "calendar") item.addedToCalendar = true;
    if (target === "tasks") item.addedToTasks = true;
    renderDetectedItems();
    showToast(response.message || `Added to Google ${formatTarget(target)}`);
  } catch (error) {
    button.disabled = false;
    button.classList.remove("saving");
    button.querySelector("span").textContent = target === "calendar" ? "Calendar" : "Tasks";
    showToast(error.message || "Save failed", "error");
  }
}

async function openSettings() {
  switchView("settings");
  setSettingsStatus("Loading settings...", "muted");

  try {
    const response = await sendRuntimeMessage({ action: "getAccountStatus" });
    renderSettingsStatus(response);
    populateSelect("calendar-select", [{ id: response.settings.defaultCalendarId || "primary", name: response.settings.defaultCalendarId || "primary" }], response.settings.defaultCalendarId || "primary");
    populateSelect("tasklist-select", [{ id: response.settings.defaultTaskListId || "@default", name: response.settings.defaultTaskListId || "@default" }], response.settings.defaultTaskListId || "@default");
    settingsStatus.classList.add("hidden");
  } catch (error) {
    setSettingsStatus(error.message || "Could not load settings.", "error");
  }
}

async function loadGoogleOptions() {
  setSettingsStatus("Connecting to Google...", "muted");

  try {
    const response = await sendRuntimeMessage({ action: "loadGoogleOptions", interactive: true });
    renderSettingsStatus({ connected: true, account: response.account });
    populateSelect("calendar-select", response.calendars, response.settings.defaultCalendarId || "primary");
    populateSelect("tasklist-select", response.taskLists, response.settings.defaultTaskListId || "@default");
    setSettingsStatus("Lists loaded. Choose defaults and save.", "muted");
  } catch (error) {
    showToast(error.message || "Could not connect Google.", "error");
    await openSettings();
  }
}

async function reconnectGoogle() {
  setSettingsStatus("Reconnecting Google...", "muted");
  await sendRuntimeMessage({ action: "disconnectGoogle" }).catch(() => null);
  await loadGoogleOptions();
}

async function saveSettings() {
  const settings = {
    defaultCalendarId: document.getElementById("calendar-select").dataset.value || "primary",
    defaultTaskListId: document.getElementById("tasklist-select").dataset.value || "@default",
  };

  try {
    await sendRuntimeMessage({ action: "saveSettings", settings });
    setSettingsStatus("Settings saved.", "muted");
    showToast("Settings saved");
  } catch (error) {
    setSettingsStatus(error.message || "Could not save settings.", "error");
  }
}

function renderSettingsStatus(response) {
  document.getElementById("account-status").textContent = response.connected
    ? response.account?.email || "Connected"
    : "Not connected";
}

function populateSelect(id, items, selectedId) {
  const root = document.getElementById(id);
  const options = dedupeById(items);
  const selected = options.find((item) => item.id === selectedId) || options[0];

  root.dataset.value = selected?.id || "";
  root.innerHTML = `
    <button class="select-trigger" type="button">
      <span>${escapeHtml(selected?.name || selected?.id || "Choose")}</span>
      <span class="select-chevron">v</span>
    </button>
    <div class="select-menu hidden">
      ${options.map((item) => `
        <button class="select-option ${item.id === selected?.id ? "selected" : ""}" type="button" data-value="${escapeAttr(item.id)}" data-label="${escapeAttr(item.name || item.id)}">
          ${escapeHtml(item.name || item.id)}
        </button>
      `).join("")}
    </div>
  `;
  bindCustomSelect(root);
}

function bindCustomSelect(root) {
  const trigger = root.querySelector(".select-trigger");
  const menu = root.querySelector(".select-menu");
  const label = trigger.querySelector("span");

  trigger.addEventListener("click", () => {
    document.querySelectorAll(".select-menu").forEach((item) => {
      if (item !== menu) item.classList.add("hidden");
    });
    menu.classList.toggle("hidden");
  });

  menu.querySelectorAll(".select-option").forEach((option) => {
    option.addEventListener("click", () => {
      root.dataset.value = option.dataset.value || "";
      label.textContent = option.dataset.label || option.textContent.trim();
      menu.querySelectorAll(".select-option").forEach((item) => item.classList.remove("selected"));
      option.classList.add("selected");
      menu.classList.add("hidden");
    });
  });
}

function showToast(message, tone = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  toastRoot.appendChild(toast);
  setTimeout(() => toast.classList.add("leaving"), 1900);
  setTimeout(() => toast.remove(), 2300);
}

function showError(message) {
  switchView("error");
  document.getElementById("error-message").textContent = message;
}

function setSettingsStatus(message, tone) {
  settingsStatus.textContent = message;
  settingsStatus.className = `inline-status ${tone || ""}`;
}

function dedupeById(items) {
  const map = new Map();
  (items || []).forEach((item) => {
    if (item?.id && !map.has(item.id)) map.set(item.id, item);
  });
  return [...map.values()];
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Extension request failed."));
        return;
      }
      resolve(response);
    });
  });
}

function normalizeItemType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  if (["event", "task", "reminder", "deadline"].includes(normalized)) return normalized;
  if (["meeting", "appointment", "calendar"].includes(normalized)) return "event";
  if (["todo", "to-do"].includes(normalized)) return "task";
  if (normalized === "due") return "deadline";
  return "task";
}

function displayType(type) {
  return type === "deadline" ? "reminder" : type;
}

function formatTarget(target) {
  return target === "calendar" ? "Calendar" : "Tasks";
}

function formatDateTime(result) {
  if (!result.date && !result.time) return "";
  if (!result.date) return result.time || "";
  const date = formatDate(result.date);
  return result.time ? `${date}, ${formatTime(result.time)}` : date;
}

function formatDate(dateValue) {
  const today = new Date();
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (sameDay(date, today)) return "Today";
  if (sameDay(date, tomorrow)) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function formatTime(timeValue) {
  const [hours, minutes] = String(timeValue).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return timeValue;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
