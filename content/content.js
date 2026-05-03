// Content Script for WhatsApp Web
const PANEL_ID = "whatstask-panel";
const STYLE_ID = "whatstask-panel-style";

let currentText = null;
let currentMessageDate = null;
let currentChatName = null;
let currentResult = null;
let currentSettings = null;
let panelSavedTargets = { calendar: false, tasks: false };

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "startPicker") {
    enterPickerMode();
    sendResponse({ ok: true });
  }
});

function enterPickerMode() {
  document.body.style.cursor = "crosshair";
  document.querySelectorAll("[data-id]").forEach((el) => {
    el.classList.add("whatstask-hoverable");
  });

  document.addEventListener("click", onMessageClick, {
    once: true,
    capture: true,
  });
  document.addEventListener("keydown", onCancelPicker, { once: true });
}

async function onMessageClick(e) {
  const msgEl = e.target.closest("[data-id]");

  if (!msgEl) {
    exitPickerMode();
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  const captured = extractMessageContext(msgEl);
  exitPickerMode();

  if (!captured.text) {
    showToast("WaTask could not extract text from that message.");
    return;
  }

  currentText = captured.text;
  currentMessageDate = captured.messageDate;
  currentChatName = captured.chatName;
  currentResult = null;
  panelSavedTargets = { calendar: false, tasks: false };

  await sendRuntimeMessage({
    action: "messageCaptured",
    text: currentText,
    messageDate: currentMessageDate,
    chatName: currentChatName,
  }).catch(() => null);

  openPanel();
  showPanelLoading();
  analyzeCapturedMessage();
}

function extractMessageContext(msgEl) {
  const textEl =
    msgEl.querySelector("span.selectable-text span[dir]") ||
    msgEl.querySelector('[class*="copyable-text"] span[dir]') ||
    msgEl.querySelector('span[dir="ltr"]') ||
    msgEl.querySelector('span[dir="rtl"]');

  const text = (textEl ? textEl.innerText : msgEl.innerText || "").trim();
  let messageDate = new Date().toLocaleString();
  const preTextEl = msgEl.closest("[data-pre-plain-text]") || msgEl.querySelector("[data-pre-plain-text]");

  if (preTextEl) {
    const preText = preTextEl.getAttribute("data-pre-plain-text");
    const match = preText?.match(/\[(.*?)\]/);
    if (match?.[1]) messageDate = match[1];
  }

  let chatName = "Unknown Chat";
  const headerRoot =
    document.querySelector("#main header") ||
    document.querySelector('[data-testid="conversation-info-header"]') ||
    document.querySelector("header");
  const headerTitle =
    document.querySelector("#main > header > div.x78zum5.x6s0dn4.x1iyjqo2.xeuugli > div.x78zum5.xdt5ytf.x1iyjqo2.xl56j7k.xeuugli.xtnn1bt.x9v5kkp.xmw7ebm.xrdum7p > div.x78zum5.x1cy8zhl.x1y332i5.xggjnk3.x1yc453h > div > span") ||
    headerRoot?.querySelector("span[title]") ||
    headerRoot?.querySelector('[dir="auto"]') ||
    headerRoot?.querySelector("h2 span") ||
    headerRoot?.querySelector("[aria-label]");

  if (headerTitle) {
    chatName =
      headerTitle.getAttribute("title") ||
      headerTitle.textContent?.trim() ||
      headerTitle.getAttribute("aria-label") ||
      chatName;
  }

  if (!chatName || chatName === "Unknown Chat") {
    const fallbackTitle = document.querySelector("#main [title]");
    if (fallbackTitle?.getAttribute("title")) {
      chatName = fallbackTitle.getAttribute("title");
    }
  }

  return { text, messageDate, chatName };
}

function onCancelPicker(e) {
  if (e.key === "Escape") exitPickerMode();
}

function exitPickerMode() {
  document.body.style.cursor = "";
  document.removeEventListener("click", onMessageClick, { capture: true });
  document.querySelectorAll(".whatstask-hoverable").forEach((el) => {
    el.classList.remove("whatstask-hoverable");
  });
}

function openPanel() {
  ensurePanelStyle();
  let panel = document.getElementById(PANEL_ID);

  if (!panel) {
    panel = document.createElement("aside");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="wt-panel-header">
        <div>
          <div class="wt-brand">WaTask</div>
          <div id="wt-subtitle" class="wt-subtitle">Review message</div>
        </div>
        <div class="wt-header-actions">
          <button id="wt-theme-btn" class="wt-icon-btn" title="Toggle theme" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8Z"/></svg>
          </button>
          <button id="wt-settings-btn" class="wt-icon-btn" title="Settings" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.36a1.7 1.7 0 0 0-1 .64l-.03.05a2 2 0 1 1-3.94 0L10 20a1.7 1.7 0 0 0-1-.64 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-.64-1l-.05-.03a2 2 0 1 1 0-3.94L4 10a1.7 1.7 0 0 0 .64-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1-.64l.03-.05a2 2 0 1 1 3.94 0L14 4a1.7 1.7 0 0 0 1 .64 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9c.1.38.32.72.64 1l.05.03a2 2 0 1 1 0 3.94L20 14c-.32.28-.54.62-.64 1Z"/></svg>
          </button>
          <button id="wt-close-btn" class="wt-icon-btn" title="Close" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div id="wt-panel-body" class="wt-panel-body"></div>
      <div class="wt-footer">
        <a href="https://www.tiptea.app/#/u/muhammad" target="_blank" title="Donate"><i class="fa-solid fa-mug-hot"></i></a>
        <a href="https://modev.space/" target="_blank" title="Portfolio"><i class="fa-solid fa-globe"></i></a>
        <a href="https://linkedin.com/in/muhammadkhallid" target="_blank" title="LinkedIn"><i class="fa-brands fa-linkedin-in"></i></a>
        <a href="https://x.com/Muhammed_khalld" target="_blank" title="Twitter"><i class="fa-brands fa-x-twitter"></i></a>
        <a href="https://github.com/muhammedkh45" target="_blank" title="GitHub"><i class="fa-brands fa-github"></i></a>
        <a href="https://www.instagram.com/modev.builds" target="_blank" title="Instagram"><i class="fa-brands fa-instagram"></i></a>
      </div>
      <div id="wt-toast-root" class="wt-toast-root"></div>
    `;
    document.body.appendChild(panel);
    panel.querySelector("#wt-close-btn").addEventListener("click", () => panel.remove());
    panel.querySelector("#wt-settings-btn").addEventListener("click", showSettings);
    panel.querySelector("#wt-theme-btn").addEventListener("click", togglePanelTheme);
    chrome.storage.local.get("uiTheme", ({ uiTheme = "light" }) => setPanelTheme(uiTheme));
  }
}

async function togglePanelTheme() {
  const panel = document.getElementById(PANEL_ID);
  const nextTheme = panel?.classList.contains("dark") ? "light" : "dark";
  setPanelTheme(nextTheme);
  await chrome.storage.local.set({ uiTheme: nextTheme });
}

function setPanelTheme(theme) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  panel.classList.toggle("dark", theme === "dark");
  const button = panel.querySelector("#wt-theme-btn");
  if (button) {
    button.innerHTML = theme === "dark"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8Z"/></svg>';
  }
}

function setPanelBody(html) {
  openPanel();
  document.getElementById("wt-panel-body").innerHTML = html;
}

function setSubtitle(text) {
  const subtitle = document.getElementById("wt-subtitle");
  if (subtitle) subtitle.textContent = text;
}

function showPanelLoading() {
  setSubtitle(currentChatName || "Review message");
  setPanelBody(`
    <div class="wt-scan-state">
      <p class="wt-scan-title">Scanning conversations...</p>
      <div class="wt-scan-bubbles">
        <div class="wt-scan-row wt-delay-0">
          <div class="wt-avatar">${escapeHtml((currentChatName || "S").charAt(0).toUpperCase())}</div>
          <div>
            <span class="wt-scan-contact">${escapeHtml(currentChatName || "Sarah Chen")}</span>
            <div class="wt-typing"><span></span><span></span><span></span></div>
          </div>
        </div>
      </div>
      <div class="wt-scan-footer">
        <div class="wt-progress"><div></div></div>
        <p>Analyzing messages for tasks & events...</p>
      </div>
    </div>
  `);
}

async function analyzeCapturedMessage() {
  try {
    const response = await sendRuntimeMessage({
      action: "analyzeMessage",
      text: currentText,
      messageDate: currentMessageDate,
      chatName: currentChatName,
    });
    currentResult = response.result;
    showResult();
  } catch (error) {
    showError(error.message || "Failed to analyze message.", true);
  }
}

function showResult() {
  const result = currentResult || {};
  const type = normalizeItemType(result.type);
  const lowConfidence = Number(result.confidence || 0) < 0.5;

  setSubtitle(currentChatName || "Ready to save");
  setPanelBody(`
    ${lowConfidence ? '<div class="wt-warning">Low confidence. Please review before saving.</div>' : ""}
    <article class="wt-detected-card ${escapeAttr(type)}">
      <div class="wt-card-head">
        <div class="wt-contact-row">
          <span class="wt-contact">${escapeHtml(currentChatName || "WhatsApp")}</span>
          <span class="wt-badge ${escapeAttr(type)}">${escapeHtml(type === "deadline" ? "reminder" : type)}</span>
        </div>
        <p class="wt-snippet">"${escapeHtml(currentText || result.title || "")}"</p>
      </div>
      <div class="wt-edit-form">
        <label>Title
          <input id="wt-edit-title" type="text" value="${escapeAttr(result.title || "Untitled")}" />
        </label>
        <div class="wt-row">
          <label>Date
            <input id="wt-edit-date" type="date" value="${escapeAttr(result.date || "")}" />
          </label>
          <label>Time
            <input id="wt-edit-time" type="time" value="${escapeAttr(result.time || "")}" />
          </label>
        </div>
        <label>Notes
          <textarea id="wt-edit-notes" rows="3">${escapeHtml(result.notes || "")}</textarea>
        </label>
      </div>
      <div class="wt-card-actions">
        <button id="wt-calendar-btn" class="wt-card-action wt-calendar-action ${panelSavedTargets.calendar ? "added" : ""}" type="button" ${panelSavedTargets.calendar ? "disabled" : ""}>
          ${panelSavedTargets.calendar
            ? '<svg class="wt-action-svg" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
            : '<svg class="wt-action-svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>'}
          <span>${panelSavedTargets.calendar ? "Added" : "Calendar"}</span>
        </button>
        <button id="wt-tasks-btn" class="wt-card-action wt-tasks-action ${panelSavedTargets.tasks ? "added" : ""}" type="button" ${panelSavedTargets.tasks ? "disabled" : ""}>
          ${panelSavedTargets.tasks
            ? '<svg class="wt-action-svg" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
            : '<svg class="wt-action-svg" viewBox="0 0 24 24"><path d="M9 12l2 2 4-5"/><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>'}
          <span>${panelSavedTargets.tasks ? "Added" : "Tasks"}</span>
        </button>
      </div>
    </article>
    <button id="wt-settings-link" class="wt-secondary" type="button">Settings</button>
  `);

  document.getElementById("wt-calendar-btn").addEventListener("click", (event) => saveCurrentResult("calendar", event.currentTarget));
  document.getElementById("wt-tasks-btn").addEventListener("click", (event) => saveCurrentResult("tasks", event.currentTarget));
  document.getElementById("wt-settings-link").addEventListener("click", showSettings);
}

function readEditedResult() {
  const title = document.getElementById("wt-edit-title")?.value || currentResult?.title || "Untitled";
  const date = document.getElementById("wt-edit-date")?.value || currentResult?.date || null;
  const time = document.getElementById("wt-edit-time")?.value || currentResult?.time || null;
  const notes = document.getElementById("wt-edit-notes")?.value || currentResult?.notes || "";

  return {
    ...currentResult,
    type: normalizeItemType(currentResult?.type),
    title,
    date,
    time,
    notes,
    chatName: currentChatName || "WhatsApp",
    originalText: currentText || "",
  };
}

function normalizeItemType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  if (["event", "task", "reminder", "deadline"].includes(normalized)) return normalized;
  if (["meeting", "appointment", "calendar"].includes(normalized)) return "event";
  if (["todo", "to-do"].includes(normalized)) return "task";
  if (normalized === "due") return "deadline";
  return "task";
}

async function saveCurrentResult(target, button) {
  const targets = {
    calendar: target === "calendar",
    tasks: target === "tasks",
  };

  button.disabled = true;
  button.classList.add("saving");
  button.querySelector("span:last-child").textContent = "Saving";

  try {
    const response = await sendRuntimeMessage({
      action: "saveItem",
      result: readEditedResult(),
      targets,
    });
    await sendRuntimeMessage({ action: "clearPendingMessage" }).catch(() => null);
    panelSavedTargets[target] = true;
    showResult();
    showPanelToast(response.message || `Added to Google ${formatTarget(target)}`);
  } catch (error) {
    button.disabled = false;
    button.classList.remove("saving");
    button.querySelector("span:last-child").textContent = target === "calendar" ? "Calendar" : "Tasks";
    showPanelToast(error.message || "Failed to save.", "error");
  }
}

function showInlineStatus(message, tone) {
  let status = document.getElementById("wt-inline-status");
  if (!status) {
    status = document.createElement("div");
    status.id = "wt-inline-status";
    document.getElementById("wt-panel-body").appendChild(status);
  }
  status.className = `wt-inline-status ${tone || ""}`;
  status.textContent = message;
}

function showSuccess(message, failures) {
  setSubtitle("Saved");
  const failureHtml = failures?.length
    ? `<div class="wt-warning">${escapeHtml(failures.map((item) => `${formatTarget(item.target)}: ${item.error}`).join("\n"))}</div>`
    : "";
  setPanelBody(`
    <div class="wt-success">OK</div>
    <p class="wt-center">${escapeHtml(message || "Saved successfully.")}</p>
    ${failureHtml}
    <button id="wt-done-btn" class="wt-primary" type="button">Done</button>
    <button id="wt-new-pick-btn" class="wt-secondary" type="button">Pick another message</button>
  `);
  document.getElementById("wt-done-btn").addEventListener("click", () => document.getElementById(PANEL_ID)?.remove());
  document.getElementById("wt-new-pick-btn").addEventListener("click", () => {
    document.getElementById(PANEL_ID)?.remove();
    enterPickerMode();
  });
}

function showPanelToast(message, tone = "success") {
  const root = document.getElementById("wt-toast-root");
  if (!root) return;

  const toast = document.createElement("div");
  toast.className = `wt-toast ${tone}`;
  toast.textContent = message;
  root.appendChild(toast);
  setTimeout(() => toast.classList.add("leaving"), 1900);
  setTimeout(() => toast.remove(), 2300);
}

function showError(message, canRetryAnalysis) {
  setSubtitle("Needs attention");
  setPanelBody(`
    <div class="wt-error-mark">!</div>
    <p class="wt-center">${escapeHtml(message)}</p>
    <button id="wt-retry-btn" class="wt-primary" type="button">${canRetryAnalysis ? "Retry analysis" : "Back to review"}</button>
    <button id="wt-settings-error-btn" class="wt-secondary" type="button">Settings</button>
  `);
  document.getElementById("wt-retry-btn").addEventListener("click", () => {
    if (canRetryAnalysis) {
      showPanelLoading();
      analyzeCapturedMessage();
    } else {
      showResult();
    }
  });
  document.getElementById("wt-settings-error-btn").addEventListener("click", showSettings);
}

async function showSettings() {
  setSubtitle("Settings");
  setPanelBody(`
    <div class="wt-spinner"></div>
    <p class="wt-center">Loading Google settings...</p>
  `);

  try {
    const status = await sendRuntimeMessage({ action: "getAccountStatus" });
    currentSettings = status.settings;
    renderSettings(status, null, null);
  } catch (error) {
    renderSettings({ connected: false, settings: currentSettings || {} }, null, error.message);
  }
}

function renderSettings(status, options, errorMessage) {
  const accountText = status.account?.email || (status.connected ? "Connected Google account" : "Not connected");
  const calendars = options?.calendars || [];
  const taskLists = options?.taskLists || [];
  const settings = options?.settings || status.settings || currentSettings || {};

  setPanelBody(`
    ${errorMessage ? `<div class="wt-warning">${escapeHtml(errorMessage)}</div>` : ""}
    <div class="wt-settings-row">
      <span>Google account</span>
      <strong>${escapeHtml(accountText)}</strong>
    </div>
    <button id="wt-connect-btn" class="wt-primary" type="button">${status.connected ? "Reload account lists" : "Connect Google"}</button>
    <button id="wt-disconnect-btn" class="wt-secondary" type="button">Reconnect / switch account</button>
    <label>Default calendar
      ${renderCustomSelect("wt-calendar-select", calendars, settings.defaultCalendarId || "primary")}
    </label>
    <label>Default task list
      ${renderCustomSelect("wt-tasklist-select", taskLists, settings.defaultTaskListId || "@default")}
    </label>
    <button id="wt-save-settings-btn" class="wt-primary" type="button">Save settings</button>
    <button id="wt-back-review-btn" class="wt-secondary" type="button">Back to review</button>
    <div class="wt-api-key-section">
      <div class="wt-api-key-header">
        <span>Your own API key <small>(optional)</small></span>
        <a href="https://aistudio.google.com/apikey" target="_blank" class="wt-get-key-link">Get free key →</a>
      </div>
      <input id="wt-user-gemini-key" type="password" placeholder="Paste Gemini API key" autocomplete="off" />
      <button id="wt-save-api-key-btn" class="wt-secondary" type="button">Save API key</button>
    </div>
    <div class="wt-support-row">
      <i class="fa-solid fa-envelope"></i>
      <a href="mailto:watask.support@gmail.com" target="_blank">watask.support@gmail.com</a>
    </div>
  `);

  bindCustomSelect("wt-calendar-select");
  bindCustomSelect("wt-tasklist-select");

  // Load existing user key
  sendRuntimeMessage({ action: "getUserApiKeys" }).then((res) => {
    const input = document.getElementById("wt-user-gemini-key");
    if (input && res?.keys?.geminiKey) input.value = res.keys.geminiKey;
  }).catch(() => {});

  document.getElementById("wt-connect-btn").addEventListener("click", loadGoogleOptions);
  document.getElementById("wt-disconnect-btn").addEventListener("click", reconnectGoogle);
  document.getElementById("wt-save-settings-btn").addEventListener("click", saveSettings);
  document.getElementById("wt-save-api-key-btn").addEventListener("click", async () => {
    const key = document.getElementById("wt-user-gemini-key")?.value?.trim() || "";
    await sendRuntimeMessage({ action: "saveUserApiKeys", keys: { geminiKey: key } });
    showToast(key ? "API key saved" : "API key removed");
  });
  document.getElementById("wt-back-review-btn").addEventListener("click", () => {
    if (currentResult) showResult();
    else showPanelLoading();
  });
}

async function loadGoogleOptions() {
  setPanelBody(`
    <div class="wt-spinner"></div>
    <p class="wt-center">Connecting to Google...</p>
  `);

  try {
    const options = await sendRuntimeMessage({ action: "loadGoogleOptions", interactive: true });
    currentSettings = options.settings;
    renderSettings({ connected: true, account: options.account, settings: options.settings }, options, null);
  } catch (error) {
    renderSettings({ connected: false, settings: currentSettings || {} }, null, error.message);
  }
}

async function reconnectGoogle() {
  await sendRuntimeMessage({ action: "disconnectGoogle" }).catch(() => null);
  await loadGoogleOptions();
}

async function saveSettings() {
  const settings = {
    defaultCalendarId: document.getElementById("wt-calendar-select")?.dataset.value || "primary",
    defaultTaskListId: document.getElementById("wt-tasklist-select")?.dataset.value || "@default",
  };
  const response = await sendRuntimeMessage({ action: "saveSettings", settings });
  currentSettings = response.settings;
  showInlineStatus("Settings saved.", "muted");
}

function renderCustomSelect(id, items, selectedId) {
  const options = normalizeSelectItems(items, selectedId);
  const selected = options.find((item) => item.id === selectedId) || options[0];

  return `
    <div id="${escapeAttr(id)}" class="wt-custom-select" data-value="${escapeAttr(selected?.id || "")}">
      <button class="wt-select-trigger" type="button">
        <span>${escapeHtml(selected?.name || selected?.id || "Choose")}</span>
        <span class="wt-select-chevron">v</span>
      </button>
      <div class="wt-select-menu hidden">
        ${options.map((item) => `
          <button class="wt-select-option ${item.id === selected?.id ? "selected" : ""}" type="button" data-value="${escapeAttr(item.id)}" data-label="${escapeAttr(item.name || item.id)}">
            ${escapeHtml(item.name || item.id)}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function normalizeSelectItems(items, selectedId) {
  const map = new Map();
  if (selectedId) map.set(selectedId, { id: selectedId, name: selectedId });
  (items || []).forEach((item) => {
    if (item?.id) {
      map.set(item.id, { id: item.id, name: `${item.name || item.id}${item.primary ? " (primary)" : ""}` });
    }
  });
  return [...map.values()];
}

function bindCustomSelect(id) {
  const root = document.getElementById(id);
  if (!root) return;

  const trigger = root.querySelector(".wt-select-trigger");
  const menu = root.querySelector(".wt-select-menu");
  const label = trigger.querySelector("span");

  trigger.addEventListener("click", () => {
    document.querySelectorAll(`#${PANEL_ID} .wt-select-menu`).forEach((item) => {
      if (item !== menu) item.classList.add("hidden");
    });
    menu.classList.toggle("hidden");
  });

  menu.querySelectorAll(".wt-select-option").forEach((option) => {
    option.addEventListener("click", () => {
      root.dataset.value = option.dataset.value || "";
      label.textContent = option.dataset.label || option.textContent.trim();
      menu.querySelectorAll(".wt-select-option").forEach((item) => item.classList.remove("selected"));
      option.classList.add("selected");
      menu.classList.add("hidden");
    });
  });
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

function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #1a1d1f;
    color: #ffffff;
    padding: 12px 24px;
    border-radius: 8px;
    border: 1px solid #25D366;
    box-shadow: 0 8px 16px rgba(0,0,0,0.2);
    z-index: 999999;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    pointer-events: none;
    transition: opacity 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function ensurePanelStyle() {
  if (document.getElementById(STYLE_ID)) return;

  if (!document.getElementById("whatstask-fa")) {
    const faLink = document.createElement("link");
    faLink.id = "whatstask-fa";
    faLink.rel = "stylesheet";
    faLink.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css";
    document.head.appendChild(faLink);
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${PANEL_ID} {
      --wt-bg: #ffffff;
      --wt-surface: #f9fafb;
      --wt-card: #ffffff;
      --wt-soft: #f3f4f6;
      --wt-border: #e5e7eb;
      --wt-header: #075e54;
      --wt-text: #1f2937;
      --wt-muted: #6b7280;
      --wt-primary: #075e54;
      --wt-event: #3b82f6;
      --wt-task: #f97316;
      --wt-reminder: #a855f7;
      --wt-calendar-bg: #eff6ff;
      --wt-calendar-text: #1d4ed8;
      --wt-tasks-bg: #fff7ed;
      --wt-tasks-text: #c2410c;
      position: fixed;
      top: 16px;
      right: 16px;
      width: 400px;
      height: min(600px, calc(100vh - 32px));
      display: flex;
      flex-direction: column;
      background: var(--wt-bg);
      color: var(--wt-text);
      border: 1px solid var(--wt-border);
      border-radius: 12px;
      box-shadow: 0 28px 80px rgba(0, 0, 0, 0.35);
      z-index: 999999;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow: hidden;
    }
    #${PANEL_ID}.dark {
      --wt-bg: #111827;
      --wt-surface: #1f2937;
      --wt-card: #1f2937;
      --wt-soft: #2b3647;
      --wt-border: #374151;
      --wt-header: #1a1a2e;
      --wt-text: #f9fafb;
      --wt-muted: #a7b0be;
      --wt-primary: #22c55e;
      --wt-calendar-bg: rgba(29, 78, 216, 0.28);
      --wt-calendar-text: #93c5fd;
      --wt-tasks-bg: rgba(194, 65, 12, 0.28);
      --wt-tasks-text: #fdba74;
    }
    #${PANEL_ID} * { box-sizing: border-box; }
    #${PANEL_ID} .hidden { display: none !important; }
    .wt-panel-header {
      min-height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      background: var(--wt-header);
      color: #ffffff;
    }
    .wt-brand {
      font-size: 18px;
      line-height: 1;
      font-weight: 700;
      letter-spacing: 0;
    }
    .wt-subtitle { color: rgba(255, 255, 255, 0.72); font-size: 13px; margin-top: 5px; }
    .wt-source { color: var(--wt-muted); font-size: 13px; font-weight: 700; }
    .wt-header-actions { display: flex; gap: 6px; align-items: center; }
    .wt-icon-btn {
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 12px;
      background: transparent;
      color: #ffffff;
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
    }
    .wt-icon-btn:hover { background: rgba(255, 255, 255, 0.12); }
    .wt-icon-btn svg {
      width: 20px;
      height: 20px;
      stroke: currentColor;
      stroke-width: 2.4;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .wt-panel-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px 16px;
      overflow: auto;
      min-height: 0;
      flex: 1;
      background: var(--wt-bg);
    }
    .wt-footer {
      flex: 0 0 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      border-top: 1px solid var(--wt-border);
      background: var(--wt-surface);
    }
    .wt-footer a {
      color: var(--wt-muted);
      text-decoration: none;
      font-size: 14px;
      font-weight: 700;
      opacity: 0.7;
      transition: opacity 160ms ease, transform 120ms ease, color 160ms ease;
    }
    .wt-footer a:hover {
      opacity: 1;
      transform: scale(1.15);
    }
    .wt-footer a[title="Donate"]:hover { color: #ff813f; }
    .wt-footer a[title="Portfolio"]:hover { color: #00b4d8; }
    .wt-footer a[title="LinkedIn"]:hover { color: #0A66C2; }
    .wt-footer a[title="Twitter"]:hover { color: #1DA1F2; }
    .wt-footer a[title="GitHub"]:hover { color: #f0f0f0; }
    .wt-footer a[title="Instagram"]:hover { color: #E4405F; }
    .wt-message {
      max-height: 118px;
      overflow: auto;
      white-space: pre-wrap;
      color: var(--wt-muted);
      background: var(--wt-soft);
      border: 1px solid transparent;
      border-radius: 12px;
      padding: 12px;
      font-size: 13px;
      line-height: 1.45;
    }
    .wt-form, .wt-targets {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .wt-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    #${PANEL_ID} label {
      display: flex;
      flex-direction: column;
      gap: 7px;
      color: var(--wt-muted);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .wt-targets label {
      min-height: 42px;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      color: var(--wt-calendar-text);
      background: var(--wt-calendar-bg);
      border-radius: 10px;
      font-size: 14px;
      text-transform: none;
      font-weight: 800;
    }
    .wt-targets label:last-child {
      color: var(--wt-tasks-text);
      background: var(--wt-tasks-bg);
    }
    #${PANEL_ID} input,
    #${PANEL_ID} textarea {
      width: 100%;
      border: 1px solid transparent;
      border-radius: 10px;
      background: var(--wt-soft);
      color: var(--wt-text);
      padding: 10px 12px;
      font: inherit;
      font-size: 14px;
    }
    #${PANEL_ID} input:focus,
    #${PANEL_ID} textarea:focus {
      outline: none;
      border-color: var(--wt-primary);
      box-shadow: 0 0 0 3px rgba(7, 94, 84, 0.12);
    }
    .wt-custom-select {
      position: relative;
      text-transform: none;
      font-weight: 700;
    }
    .wt-select-trigger {
      width: 100%;
      min-height: 42px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: var(--wt-soft);
      color: var(--wt-text);
      padding: 10px 12px;
      cursor: pointer;
      font: inherit;
      font-size: 14px;
      text-align: left;
    }
    .wt-select-trigger:hover,
    .wt-custom-select.open .wt-select-trigger {
      border-color: var(--wt-primary);
    }
    .wt-select-trigger span:first-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .wt-select-chevron {
      color: var(--wt-primary);
      font-size: 12px;
    }
    .wt-select-menu {
      position: absolute;
      left: 0;
      right: 0;
      top: calc(100% + 6px);
      z-index: 10;
      max-height: 184px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      padding: 6px;
      gap: 3px;
      border: 1px solid var(--wt-border);
      border-radius: 10px;
      background: var(--wt-card);
      box-shadow: 0 16px 34px rgba(15, 23, 42, 0.16);
    }
    .wt-select-option {
      min-height: 36px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--wt-muted);
      padding: 9px 10px;
      cursor: pointer;
      font: inherit;
      font-size: 14px;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .wt-select-option:hover {
      background: rgba(7, 94, 84, 0.1);
      color: var(--wt-primary);
    }
    .wt-select-option.selected {
      background: rgba(7, 94, 84, 0.1);
      color: var(--wt-primary);
    }
    #${PANEL_ID} input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: currentColor;
    }
    .wt-primary, .wt-secondary {
      min-height: 42px;
      border-radius: 8px;
      border: 0;
      cursor: pointer;
      font-weight: 800;
      font-size: 14px;
      font-family: inherit;
    }
    .wt-primary { background: var(--wt-primary); color: #ffffff; }
    .wt-secondary {
      background: var(--wt-soft);
      color: var(--wt-text);
      border: 1px solid var(--wt-border);
    }
    .wt-primary:disabled { opacity: 0.65; cursor: default; }
    .wt-badge {
      align-self: flex-start;
      min-height: 22px;
      padding: 2px 10px;
      border-radius: 999px;
      background: #f3e8ff;
      color: #7c3aed;
      font-size: 12px;
      font-weight: 800;
      text-transform: lowercase;
    }
    .wt-badge.meeting, .wt-badge.event { background: #dbeafe; color: #1d4ed8; }
    .wt-badge.task { background: #ffedd5; color: #c2410c; }
    .wt-badge.deadline, .wt-badge.reminder { background: #f3e8ff; color: #7c3aed; }
    .wt-warning, .wt-inline-status {
      white-space: pre-wrap;
      border-radius: 10px;
      padding: 12px 14px;
      color: #c2410c;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      font-size: 13px;
      line-height: 1.4;
    }
    .wt-inline-status.muted {
      color: var(--wt-muted);
      background: var(--wt-soft);
      border-color: var(--wt-border);
    }
    .wt-inline-status.error { color: #dc2626; }
    .wt-scan-state {
      flex: 1;
      min-height: 420px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: wt-fade-in 180ms ease both;
    }
    .wt-scan-title {
      margin: 8px 0 0;
      color: var(--wt-muted);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-align: center;
    }
    .wt-scan-bubbles {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 16px;
    }
    .wt-scan-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      opacity: 0;
      animation: wt-bubble-in 420ms ease forwards;
    }
    .wt-delay-0 { animation-delay: 0ms; }
    .wt-delay-1 { animation-delay: 600ms; }
    .wt-delay-2 { animation-delay: 1200ms; }
    .wt-avatar {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      flex-shrink: 0;
      border-radius: 999px;
      background: #e5e7eb;
      color: #4b5563;
      font-size: 12px;
      font-weight: 700;
    }
    #${PANEL_ID}.dark .wt-avatar {
      background: #374151;
      color: #d1d5db;
    }
    .wt-scan-contact {
      display: block;
      margin: 0 0 4px 4px;
      color: var(--wt-muted);
      font-size: 12px;
    }
    .wt-typing {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 12px 16px;
      border-radius: 18px 18px 18px 5px;
      background: #e2f7cb;
      box-shadow: 0 1px 4px rgba(15, 23, 42, 0.1);
    }
    #${PANEL_ID}.dark .wt-typing { background: #1a3a2a; }
    .wt-typing span {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: var(--wt-primary);
      animation: wt-typing-dot 1.2s ease-in-out infinite;
    }
    .wt-typing span:nth-child(2) { animation-delay: 150ms; opacity: 0.7; }
    .wt-typing span:nth-child(3) { animation-delay: 300ms; opacity: 0.55; }
    .wt-scan-footer {
      flex: 0 0 auto;
    }
    .wt-progress {
      height: 6px;
      overflow: hidden;
      border-radius: 999px;
      background: #e5e7eb;
    }
    #${PANEL_ID}.dark .wt-progress { background: #374151; }
    .wt-progress div {
      height: 100%;
      width: 0;
      border-radius: inherit;
      background: var(--wt-primary);
      animation: wt-progress-scan 2.5s ease-in-out infinite;
    }
    .wt-scan-footer p {
      margin: 10px 0 0;
      color: var(--wt-muted);
      text-align: center;
      font-size: 12px;
    }
    .wt-detected-card {
      position: relative;
      padding: 12px 12px 12px 16px;
      overflow: hidden;
      border-radius: 10px;
      border: 1px solid rgba(229, 231, 235, 0.55);
      background: var(--wt-card);
      box-shadow: 0 1px 6px rgba(15, 23, 42, 0.07);
      animation: wt-card-in 260ms ease both;
    }
    #${PANEL_ID}.dark .wt-detected-card { border-color: rgba(55, 65, 81, 0.62); }
    .wt-detected-card::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 4px;
      background: var(--wt-reminder);
    }
    .wt-detected-card.event::before { background: var(--wt-event); }
    .wt-detected-card.task::before { background: var(--wt-task); }
    .wt-card-head { margin-bottom: 8px; }
    .wt-contact-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .wt-contact {
      color: var(--wt-text);
      font-size: 14px;
      font-weight: 700;
    }
    .wt-snippet {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin: 0;
      color: var(--wt-muted);
      font-size: 12px;
      line-height: 1.42;
    }
    .wt-detected-box {
      padding: 10px;
      margin-bottom: 12px;
      border-radius: 8px;
      background: var(--wt-soft);
    }
    .wt-edit-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 12px;
    }
    .wt-edit-form textarea {
      resize: vertical;
      min-height: 50px;
    }
    .wt-detected-box p {
      margin: 0 0 4px;
      color: var(--wt-text);
      font-size: 14px;
      font-weight: 600;
    }
    .wt-detected-box span {
      color: var(--wt-muted);
      font-size: 12px;
    }
    .wt-card-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .wt-card-action {
      min-height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      transition: transform 120ms ease, opacity 180ms ease;
    }
    .wt-card-action:active { transform: scale(0.97); }
    .wt-calendar-action {
      background: var(--wt-calendar-bg);
      color: var(--wt-calendar-text);
    }
    .wt-tasks-action {
      background: var(--wt-tasks-bg);
      color: var(--wt-tasks-text);
    }
    .wt-card-action.added {
      background: #dcfce7;
      color: #15803d;
      cursor: default;
    }
    .wt-card-action.saving { opacity: 0.75; }
    .wt-action-svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .wt-toast-root {
      position: absolute;
      top: 12px;
      left: 50%;
      z-index: 5;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      transform: translateX(-50%);
    }
    .wt-toast {
      max-width: 320px;
      padding: 10px 14px;
      border-radius: 999px;
      background: var(--wt-card);
      color: #15803d;
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.22);
      font-size: 13px;
      font-weight: 600;
      animation: wt-toast-in 220ms ease both;
    }
    .wt-toast.error { color: #dc2626; }
    .wt-toast.leaving { animation: wt-toast-out 220ms ease both; }
    .wt-settings-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 14px;
      border-radius: 12px;
      background: var(--wt-soft);
      color: var(--wt-muted);
      font-size: 14px;
    }
    .wt-api-key-section {
      margin-top: 10px;
      padding-top: 12px;
      border-top: 1px solid var(--wt-border);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .wt-api-key-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      color: var(--wt-text);
      font-weight: 600;
    }
    .wt-api-key-header small { font-weight: 400; color: var(--wt-muted); }
    .wt-get-key-link {
      font-size: 11px;
      font-weight: 500;
      color: var(--wt-active);
      text-decoration: none;
    }
    .wt-get-key-link:hover { text-decoration: underline; }
    #wt-user-gemini-key {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--wt-border);
      border-radius: 6px;
      background: var(--wt-bg);
      color: var(--wt-text);
      font-size: 13px;
      font-family: inherit;
      box-sizing: border-box;
    }
    #wt-user-gemini-key:focus {
      outline: none;
      border-color: var(--wt-active);
    }
    .wt-support-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 8px;
      padding-top: 12px;
      border-top: 1px solid var(--wt-border);
      font-size: 12px;
      color: var(--wt-muted);
    }
    .wt-support-row i { font-size: 13px; }
    .wt-support-row a {
      color: var(--wt-muted);
      text-decoration: none;
      transition: color 160ms ease;
    }
    .wt-support-row a:hover {
      color: var(--wt-active);
      text-decoration: underline;
    }
    .wt-spinner {
      width: 42px;
      height: 42px;
      border: 4px solid var(--wt-border);
      border-top-color: var(--wt-primary);
      border-radius: 999px;
      animation: wt-spin 0.9s linear infinite;
      margin: 38px auto 6px;
    }
    .wt-center {
      text-align: center;
      color: var(--wt-muted);
      margin: 0;
      line-height: 1.45;
      font-size: 15px;
    }
    .wt-success, .wt-error-mark {
      width: 58px;
      height: 58px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      margin: 38px auto 10px;
      font-size: 24px;
      font-weight: 800;
    }
    .wt-success { color: #15803d; background: #dcfce7; }
    .wt-success { font-size: 18px; }
    .wt-error-mark { color: #dc2626; background: #fee2e2; }
    @keyframes wt-spin { to { transform: rotate(360deg); } }
    @keyframes wt-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes wt-bubble-in {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes wt-card-in {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes wt-typing-dot {
      0%, 100% { opacity: 0.42; transform: translateY(0); }
      50% { opacity: 1; transform: translateY(-6px); }
    }
    @keyframes wt-progress-scan { from { width: 0; } to { width: 100%; } }
    @keyframes wt-toast-in {
      from { opacity: 0; transform: translateY(-12px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes wt-toast-out {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(-12px) scale(0.96); }
    }
    @media (max-width: 520px) {
      #${PANEL_ID} {
        left: 12px;
        right: 12px;
        width: auto;
      }
    }
  `;
  document.documentElement.appendChild(style);
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

function formatTarget(target) {
  return target === "calendar" ? "Calendar" : "Tasks";
}
