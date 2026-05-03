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
        <a href="https://www.tiptea.app/#/u/muhammad" target="_blank" title="Donate"><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor"><path d="M88 0C74.7 0 64 10.7 64 24c0 9.5 5.5 17.7 13.5 21.6L64 80H24C10.7 80 0 90.7 0 104s10.7 24 24 24h8l17.8 240.3C52.4 395.8 75.8 416 103.3 416H308.7c27.5 0 50.9-20.2 53.5-47.7L380 128h8c13.3 0 24-10.7 24-24s-10.7-24-24-24H348l-13.5-34.4C342.5 41.7 348 33.5 348 24c0-13.3-10.7-24-24-24H88zm80 48h76l8 32H160l8-32zM127.6 128H284.4l-15 200H142.6l-15-200zM432 224a112 112 0 1 1 0 224 112 112 0 1 1 0-224zm0 160c26.5 0 48-21.5 48-48s-21.5-48-48-48-48 21.5-48 48 21.5 48 48 48z"/></svg></a>
        <a href="https://modev.space/" target="_blank" title="Portfolio"><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor"><path d="M352 256c0 22.2-1.2 43.6-3.3 64H163.3c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64H348.7c2.2 20.4 3.3 41.8 3.3 64zm28.8-64H503.9c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64H380.8c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32H376.7c-10-63.9-29.8-117.4-55.3-151.6C399.5 29.9 463.3 90.7 493.4 160zM256 0c36.8 0 79.9 67.1 97.8 160H158.2C176.1 67.1 219.2 0 256 0zM135.3 160H18.6C48.7 90.7 112.5 29.9 190.7 8.4 165.2 42.6 145.4 96.1 135.3 160zM8.1 192H131.2c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64H8.1C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.7-15.7-22-34.1-30.6-55.6H8.1c27.3 61.9 78.4 111.4 141 139.7-18.6-21.6-35.4-51.4-48.7-84.1H194.7zM256 512c-36.8 0-79.9-67.1-97.8-160H353.8c-17.9 92.9-61 160-97.8 160zm61.3-65.4c25.5-34.2 45.3-87.7 55.3-151.6H493.4c-30.1 69.3-93.9 130.1-172.1 151.6z"/></svg></a>
        <a href="https://linkedin.com/in/muhammadkhallid" target="_blank" title="LinkedIn"><svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor"><path d="M100.3 448H7.4V148.9h92.9zM53.8 108.1C24.1 108.1 0 83.5 0 53.8a53.8 53.8 0 0 1 107.6 0c0 29.7-24.1 54.3-53.8 54.3zM447.9 448h-92.7V302.4c0-34.7-.7-79.2-48.3-79.2-48.3 0-55.7 37.7-55.7 76.7V448h-92.8V148.9h89.1v40.8h1.3c12.4-23.5 42.7-48.3 87.9-48.3 94 0 111.3 61.9 111.3 142.3V448z"/></svg></a>
        <a href="https://x.com/Muhammed_khalld" target="_blank" title="Twitter"><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor"><path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z"/></svg></a>
        <a href="https://github.com/muhammedkh45" target="_blank" title="GitHub"><svg viewBox="0 0 496 512" width="14" height="14" fill="currentColor"><path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8z"/></svg></a>
        <a href="https://www.instagram.com/modev.builds" target="_blank" title="Instagram"><svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor"><path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/></svg></a>
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
      <svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor"><path d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48H48zM0 176V384c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V176L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z"/></svg>
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
