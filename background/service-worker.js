importScripts("../popup/config.js");

const DEFAULT_SETTINGS = {
  defaultCalendarId: "primary",
  defaultTaskListId: "@default",
};

const SUPPORT_MSG = CONFIG?.SUPPORT_EMAIL
  ? ` If this keeps happening, contact us at ${CONFIG.SUPPORT_EMAIL}`
  : "";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg)
    .then((data) => sendResponse({ ok: true, ...data }))
    .catch((error) => {
      // console.error("WaTask background error:", error);
      sendResponse({ ok: false, error: friendlyError(error) });
    });

  return true;
});

function friendlyError(error) {
  const raw = error?.message || "";

  if (raw.includes("API key")) return "The extension is not configured correctly. Please contact support." + SUPPORT_MSG;
  if (raw.includes("timed out")) return "Connection timed out. Please check your internet and try again.";
  if (raw.includes("not connected")) return "Please connect your Google account first in Settings.";
  if (raw.includes("PERMISSION_DENIED")) return "Google account permission denied. Try reconnecting in Settings.";
  if (raw.includes("quota") || raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED")) return "Our AI service is experiencing high demand. Please try again in a moment.";
  if (raw.includes("Failed to fetch") || raw.includes("NetworkError")) return "No internet connection. Please check your network and try again.";

  if (raw && raw.length < 120) return raw;
  return "Something went wrong. Please try again." + SUPPORT_MSG;
}

async function handleMessage(msg) {
  switch (msg?.action) {
    case "messageCaptured":
      await chrome.storage.local.set({
        pendingText: msg.text,
        pendingDate: msg.messageDate,
        pendingChatName: msg.chatName,
      });
      return { status: "saved" };

    case "analyzeMessage":
      return { result: await analyzeWithFallback(msg.text, msg.messageDate, msg.chatName) };

    case "saveItem":
      return await saveItem(msg.result, msg.targets || {});

    case "getSettings":
      return { settings: await getSettings() };

    case "saveSettings":
      await saveSettings(msg.settings || {});
      return { settings: await getSettings() };

    case "saveUserApiKeys":
      await chrome.storage.local.set({ userApiKeys: msg.keys || {} });
      return { saved: true };

    case "getUserApiKeys":
      return { keys: await getUserKeys() };

    case "loadGoogleOptions":
      return await loadGoogleOptions(Boolean(msg.interactive));

    case "getAccountStatus":
      return await getAccountStatus();

    case "disconnectGoogle":
      await disconnectGoogle();
      return { connected: false };

    case "clearPendingMessage":
      await clearPendingMessage();
      return { status: "cleared" };

    case "getToken":
      return { token: await getToken(Boolean(msg.interactive ?? true)) };

    default:
      throw new Error("Unrecognized request. Please update the extension or contact support." + SUPPORT_MSG);
  }
}

function buildSystemPrompt(messageDate, chatName) {
  return `You are a smart assistant that extracts actionable items from Arabic and English WhatsApp messages.
Extract ONLY structured JSON. No explanation. No markdown.

IMPORTANT CONTEXT:
The message was sent on/at: "${messageDate || new Date().toLocaleString()}".
You MUST use this exact date and time as your current reference point to accurately resolve any relative dates.
Message source chat name: "${chatName || "Unknown Chat"}".
Do not include a source/chat-name line in notes; the extension adds that separately.

Return this exact JSON shape:
{
  "type": "event" | "task" | "reminder" | "deadline",
  "title": "short clear English title",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM (24h) or null",
  "end_time": "HH:MM (24h) or null",
  "attendees": "description of who should attend, or null",
  "notes": "extra context or agenda, or null",
  "confidence": 0.0 to 1.0
}`;
}

async function getUserKeys() {
  const data = await chrome.storage.local.get("userApiKeys");
  return data.userApiKeys || {};
}

async function analyzeWithFallback(text, messageDate, chatName) {
  let lastError = null;
  const userKeys = await getUserKeys();

  // Priority 1: User's own Gemini key (direct call)
  const geminiKey = userKeys.geminiKey || CONFIG?.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      return await analyzeWithGemini(text, messageDate, chatName, geminiKey);
    } catch (error) {
      lastError = error;
      const msg = error?.message || "";
      const isCapacity = msg.includes("429") || msg.includes("503") || msg.includes("overloaded")
        || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("capacity") || msg.includes("quota");

      if (!isCapacity && !CONFIG?.PROXY_URL && !CONFIG?.OPENROUTER_API_KEY) throw error;
    }
  }

  // Priority 2: Proxy endpoint (your key stays server-side)
  if (CONFIG?.PROXY_URL) {
    try {
      return await analyzeWithProxy(text, messageDate, chatName);
    } catch (error) {
      lastError = error;
    }
  }

  // Priority 3: OpenRouter fallback
  const openrouterKey = userKeys.openrouterKey || CONFIG?.OPENROUTER_API_KEY;
  if (openrouterKey) {
    try {
      return await analyzeWithOpenRouter(text, messageDate, chatName, openrouterKey);
    } catch (error) {
      lastError = error;
    }
  }

  // All failed
  if (lastError) throw lastError;
  throw new Error("AI service is not configured. Add your own API key in Settings or contact support." + SUPPORT_MSG);
}

async function analyzeWithProxy(text, messageDate, chatName) {
  const response = await fetch(`${CONFIG.PROXY_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, messageDate, chatName }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || "AI proxy error. Please try again.");
  }

  const result = data.result;
  result.type = normalizeItemType(result.type);
  if (chatName) {
    result.notes = withSourceNote(result.notes, chatName);
  }
  return result;
}

async function analyzeWithGemini(text, messageDate, chatName, apiKey) {
  const model = "gemini-2.5-flash";
  const systemText = buildSystemPrompt(messageDate, chatName);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [
          {
            role: "user",
            parts: [{ text: `Extract the actionable item from this message:\n\n"${text}"` }],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => null);
    const status = response.status;
    const errMsg = errData?.error?.message || "";
    throw new Error(`Gemini ${status}: ${errMsg}`);
  }

  const data = await response.json();
  const resultContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!resultContent) throw new Error("AI returned an empty response. Please try again.");

  return parseAIResult(resultContent, chatName);
}

async function analyzeWithOpenRouter(text, messageDate, chatName, apiKey) {
  const systemText = buildSystemPrompt(messageDate, chatName);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [
        { role: "system", content: systemText },
        { role: "user", content: `Extract the actionable item from this message:\n\n"${text}"` },
      ],
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => null);
    throw new Error(`AI service error: ${errData?.error?.message || response.status}. Please try again.`);
  }

  const data = await response.json();
  const resultContent = data.choices?.[0]?.message?.content || "";
  if (!resultContent) throw new Error("AI returned an empty response. Please try again.");

  return parseAIResult(resultContent, chatName);
}

function parseAIResult(resultContent, chatName) {
  let cleaned = resultContent.replace(/```json\n?|\n?```/gi, "").trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd !== -1) cleaned = cleaned.slice(jsonStart, jsonEnd + 1);

  let result;
  try {
    result = JSON.parse(cleaned);
  } catch {
    throw new Error("Could not understand the AI response. Please try again.");
  }

  result.type = normalizeItemType(result.type);
  if (chatName) {
    result.notes = withSourceNote(result.notes, chatName);
  }
  return result;
}

function normalizeItemType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  const aliases = {
    event: "event",
    meeting: "event",
    appointment: "event",
    calendar: "event",
    task: "task",
    todo: "task",
    "to-do": "task",
    reminder: "reminder",
    remind: "reminder",
    deadline: "deadline",
    due: "deadline",
  };

  return aliases[normalized] || "task";
}

function withSourceNote(notes, chatName) {
  const cleanNotes = String(notes || "").trim();
  const sourceLine = `Source: ${chatName}`;
  const sourcePattern = new RegExp(`(^|\\n)\\s*Source:\\s*${escapeRegExp(chatName)}\\s*($|\\n)`, "i");

  if (sourcePattern.test(cleanNotes)) {
    return cleanNotes;
  }

  return cleanNotes ? `${cleanNotes}\n${sourceLine}` : sourceLine;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function saveItem(result, targets) {
  const selectedTargets = {
    calendar: Boolean(targets.calendar),
    tasks: Boolean(targets.tasks),
  };

  if (!selectedTargets.calendar && !selectedTargets.tasks) {
    throw new Error("Choose Calendar, Tasks, or both before saving.");
  }

  const token = await getToken(true);
  const settings = await getSettings();
  const outcomes = [];

  if (selectedTargets.calendar) {
    outcomes.push(await settleSave("calendar", () => saveToCalendar(result, token, settings)));
  }

  if (selectedTargets.tasks) {
    outcomes.push(await settleSave("tasks", () => saveToTasks(result, token, settings)));
  }

  const successes = outcomes.filter((item) => item.ok).map((item) => item.target);
  const failures = outcomes.filter((item) => !item.ok);

  if (successes.length) {
    await saveToHistory({ ...result, savedTo: successes });
    await clearPendingMessage();
  }

  if (!successes.length && failures.length) {
    throw new Error(buildSaveMessage(successes, failures));
  }

  return {
    savedTo: successes,
    failures,
    message: buildSaveMessage(successes, failures),
  };
}

async function settleSave(target, run) {
  try {
    await run();
    return { target, ok: true };
  } catch (error) {
    return { target, ok: false, error: error.message || "Save failed" };
  }
}

function buildSaveMessage(successes, failures) {
  if (failures.length === 0) {
    return `Saved to ${formatTargets(successes)}.`;
  }
  if (successes.length === 0) {
    return `Could not save to ${formatTargets(failures.map((item) => item.target))}.`;
  }
  return `Saved to ${formatTargets(successes)}. Failed: ${formatTargets(failures.map((item) => item.target))}.`;
}

function formatTargets(targets) {
  return targets
    .map((target) => (target === "calendar" ? "Calendar" : "Tasks"))
    .join(" and ");
}

async function saveToCalendar(result, token, settings) {
  const calendarId = encodeURIComponent(settings.defaultCalendarId || "primary");
  const event = buildCalendarEvent(result);
  let res = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    token,
    { method: "POST", body: JSON.stringify(event) },
  );

  if (res.status === 401 || res.status === 403) {
    const retryToken = await refreshToken(token);
    res = await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
      retryToken,
      { method: "POST", body: JSON.stringify(event) },
    );
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error?.message || "Could not save to Google Calendar. Please try again.");
  }
}

function buildCalendarEvent(result) {
  if (!result.date) {
    throw new Error("A date is required to save to Calendar. Please add a date and try again.");
  }

  const endTime =
    result.end_time ||
    (result.time
      ? `${String(parseInt(result.time.split(":")[0], 10) + 1).padStart(2, "0")}:${result.time.split(":")[1]}`
      : null);

  return {
    summary: result.title || "Untitled",
    description: result.notes || "",
    start: result.time
      ? { dateTime: `${result.date}T${result.time}:00`, timeZone: "Africa/Cairo" }
      : { date: result.date },
    end: result.time
      ? { dateTime: `${result.date}T${endTime}:00`, timeZone: "Africa/Cairo" }
      : { date: result.date },
  };
}

async function saveToTasks(result, token, settings) {
  const taskListId = encodeURIComponent(settings.defaultTaskListId || "@default");
  const task = {
    title: result.title || "Untitled",
    notes: result.notes || "",
  };
  if (result.date) task.due = `${result.date}T00:00:00.000Z`;

  let res = await googleFetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`,
    token,
    { method: "POST", body: JSON.stringify(task) },
  );

  if (res.status === 401 || res.status === 403) {
    const retryToken = await refreshToken(token);
    res = await googleFetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`,
      retryToken,
      { method: "POST", body: JSON.stringify(task) },
    );
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error?.message || "Could not save to Google Tasks. Please try again.");
  }
}

function googleFetch(url, token, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

async function loadGoogleOptions(interactive) {
  const token = await getToken(interactive);
  const [calendarRes, taskListRes] = await Promise.all([
    googleFetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", token),
    googleFetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists", token),
  ]);

  if (!calendarRes.ok) {
    throw new Error("Could not load your calendars. Please check your Google account connection.");
  }

  if (!taskListRes.ok) {
    throw new Error("Could not load your task lists. Please check your Google account connection.");
  }

  const calendarData = await calendarRes.json();
  const taskListData = await taskListRes.json();

  return {
    account: await getProfile(),
    calendars: (calendarData.items || []).map((item) => ({
      id: item.id,
      name: item.summary || item.id,
      primary: Boolean(item.primary),
    })),
    taskLists: (taskListData.items || []).map((item) => ({
      id: item.id,
      name: item.title || item.id,
    })),
    settings: await getSettings(),
  };
}

async function getAccountStatus() {
  const token = await getToken(false).catch(() => null);
  return {
    connected: Boolean(token),
    account: token ? await getProfile() : null,
    settings: await getSettings(),
  };
}

function getProfile() {
  return new Promise((resolve) => {
    if (!chrome.identity.getProfileUserInfo) {
      resolve(null);
      return;
    }

    try {
      chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }, resolve);
    } catch (error) {
      chrome.identity.getProfileUserInfo(resolve);
    }
  });
}

async function disconnectGoogle() {
  const token = await getToken(false).catch(() => null);
  if (token) {
    await removeCachedToken(token);
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${encodeURIComponent(token)}`).catch(() => null);
  }
}

async function refreshToken(token) {
  await removeCachedToken(token);
  return await getToken(true);
}

function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

function getToken(interactive = true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Connection to Google timed out. Please check your internet and try again.")),
      15000,
    );

    chrome.identity.getAuthToken({ interactive }, (token) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!token) {
        reject(new Error("Google account is not connected. Go to Settings to connect."));
        return;
      }
      resolve(token);
    });
  });
}

async function getSettings() {
  const data = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
}

async function saveSettings(settings) {
  const current = await getSettings();
  await chrome.storage.local.set({ settings: { ...current, ...settings } });
}

async function saveToHistory(item) {
  const { history = [] } = await chrome.storage.local.get("history");
  const newItem = { ...item, savedAt: new Date().toISOString() };
  history.unshift(newItem);
  await chrome.storage.local.set({ history: history.slice(0, 50) });
}

async function clearPendingMessage() {
  await chrome.storage.local.remove(["pendingText", "pendingDate", "pendingChatName"]);
}
