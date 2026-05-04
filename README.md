<p align="center">
  <img src="icons/icon128.png" alt="WaTask Logo" width="128" height="128" />
</p>

<h1 align="center">WaTask</h1>

<p align="center">
  <strong>Turn WhatsApp messages into Google Calendar events and Tasks — with one click.</strong>
</p>

<p align="center">
  Chrome Extension · Manifest V3 · Gemini AI · Google Calendar & Tasks API
</p>

---

## What is WaTask?

WaTask is a **Chrome Extension** that works directly on **WhatsApp Web**. Click any message, and the extension captures it, analyzes it with **Gemini AI**, extracts actionable items (events, tasks, reminders, deadlines), and lets you save them to **Google Calendar** or **Google Tasks** — all without leaving WhatsApp.

No copy-paste. No share sheet. Just point, click, review, and save.

---

## Features

- 🎯 **Message Picker** — crosshair cursor mode to select any WhatsApp message
- 🤖 **Gemini AI Analysis** — extracts title, date, time, type, and notes from Arabic & English messages
- 📅 **Google Calendar Integration** — save events with proper date/time directly to your calendar
- ✅ **Google Tasks Integration** — save tasks and reminders with due dates
- ✏️ **Editable Fields** — edit title, date (date picker), time (time picker), and notes before saving
- 🌗 **Dark / Light Theme** — toggle theme, persisted across sessions
- 📋 **History** — view previously analyzed messages (up to 50 items)
- 🔍 **Filter Bar** — filter items by All, Events, Tasks, or Reminders
- ⚙️ **Settings** — choose default calendar and task list
- 📱 **Dual UI** — works both as a popup and as an inline panel on WhatsApp Web

---

## User Flow

```
1. User opens WhatsApp Web (web.whatsapp.com)
2. User clicks the WaTask extension icon or the pick button in the header
3. The page enters "picker mode" (cursor changes to crosshair)
4. WhatsApp messages get a green hover highlight as cursor moves over them
5. User clicks on any message bubble
   → Picker mode ends
   → An inline panel opens on WhatsApp Web
   → AI analyzes the captured text (animated loading state with chat name)
6. Editable result card appears with: title, date picker, time picker, notes
7. User reviews and edits if needed
8. User clicks "Calendar" or "Tasks" to save
9. Done ✓ — item saved, confirmation shown via toast
```

---

## Tech Stack

| Layer          | Technology                                                              |
| -------------- | ----------------------------------------------------------------------- |
| Extension type | **Chrome Extension — Manifest V3**                                      |
| Languages      | **HTML + CSS + JavaScript** (no frameworks)                             |
| AI             | **Gemini API** — model: `gemini-2.5-flash`                             |
| Calendar       | **Google Calendar API v3** (OAuth 2.0 via `chrome.identity`)            |
| Tasks          | **Google Tasks API v1** (OAuth 2.0 via `chrome.identity`)               |
| Auth           | **`chrome.identity.getAuthToken`** — built-in Chrome extension OAuth    |
| Storage        | **`chrome.storage.local`** — history, settings, theme, pending messages |
| Hosting        | None — runs entirely in the browser                                     |

> No Next.js. No Vercel. No Supabase. The AI and Google API calls happen directly from the extension's background service worker.

---

## Project Structure

```
whatstask-extension/
├── manifest.json              ← Extension manifest (Manifest V3)
├── popup/
│   ├── popup.html             ← Extension popup UI
│   ├── popup.css              ← Popup styles (light/dark theme)
│   ├── popup.js               ← Popup logic, rendering, event handling
│   └── config.js              ← API keys (gitignored)
├── content/
│   └── content.js             ← Injected into WhatsApp Web
│                                 • Message picker (crosshair mode)
│                                 • Inline result panel with editable fields
│                                 • Full CSS injected via JS
├── background/
│   └── service-worker.js      ← Background service worker
│                                 • Gemini AI API calls
│                                 • Google Calendar/Tasks API calls
│                                 • OAuth token management
│                                 • History management
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── assets/
    └── picker.css             ← Hover highlight styles for picker mode
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     WhatsApp Web                         │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ content.js                                          │ │
│  │  • Message picker (crosshair + click capture)       │ │
│  │  • Inline panel UI (editable result card)           │ │
│  │  • Communicates with service worker via messages    │ │
│  └───────────────┬─────────────────────────────────────┘ │
└──────────────────┼───────────────────────────────────────┘
                   │ chrome.runtime.sendMessage
                   ▼
┌──────────────────────────────────────────────────────────┐
│ service-worker.js (Background)                           │
│  • analyzeMessage → Gemini API                           │
│  • saveItem → Google Calendar API / Google Tasks API     │
│  • getToken → chrome.identity.getAuthToken               │
│  • saveToHistory → chrome.storage.local                  │
└──────────────────┬───────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│ popup.html/js (Extension Popup)                          │
│  • History view with filter bar (All/Events/Tasks/etc.)  │
│  • Editable cards: title, date, time, notes              │
│  • Pick button, theme toggle, settings                   │
│  • Can also trigger analysis from pending messages       │
└──────────────────────────────────────────────────────────┘
```

---

## UI States

### Extension Popup (400×600px)

| State        | What's shown                                                          |
| ------------ | --------------------------------------------------------------------- |
| **Default**  | Filter bar + history cards (editable) + pick button in header         |
| **Loading**  | Animated scanning bubbles (dynamic chat name) + progress bar          |
| **Settings** | Google account status, calendar/task list selectors, save/back        |
| **Error**    | Error message + retry button                                          |

### Content Script Panel (injected into WhatsApp Web)

| State        | What's shown                                                          |
| ------------ | --------------------------------------------------------------------- |
| **Loading**  | Single animated scan row with chat name + progress bar                |
| **Result**   | Editable card: title input, date picker, time picker, notes textarea  |
| **Settings** | Google account, calendar/task list selectors                          |
| **Error**    | Error message + retry + settings                                      |
| **Success**  | Confirmation + "Pick another message" button                          |

---

## Editable Fields

After AI analysis, users can edit all fields before saving:

| Field    | Input Type      | What it controls                      |
| -------- | --------------- | ------------------------------------- |
| Title    | `<input text>`  | Event summary / Task title            |
| Date     | `<input date>`  | Calendar date picker (YYYY-MM-DD)     |
| Time     | `<input time>`  | Time picker (HH:MM, 24h format)       |
| Notes    | `<textarea>`    | Event description / Task notes        |

This ensures dates are always in the correct format for Google Calendar API.

---

## AI Prompt

The Gemini AI is instructed to extract structured JSON from WhatsApp messages:

```json
{
  "type": "event | task | reminder | deadline",
  "title": "short clear English title",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM (24h) or null",
  "end_time": "HH:MM (24h) or null",
  "attendees": "description or null",
  "notes": "extra context or null",
  "confidence": 0.0 to 1.0
}
```

- Handles both **Arabic** and **English** messages
- Uses the message's timestamp as the reference date for resolving relative dates
- Appends the chat source name to notes automatically

---

## Google Auth

Authentication uses Chrome's built-in `chrome.identity.getAuthToken`:

- Interactive mode opens Google sign-in tab
- Token is cached automatically by Chrome
- On 401/403 errors, the token is refreshed and the request retried
- Users can disconnect/reconnect accounts from Settings

OAuth scopes:
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/tasks`

---

## Design System

### Light Theme
```
Background:      #ffffff
Header:          #075e54 (WhatsApp green)
Card:            #ffffff
Border:          #e5e7eb
Text:            #1f2937
Muted:           #6b7280
Active:          #075e54
Event badge:     #3b82f6 (blue)
Task badge:      #f97316 (orange)
Reminder badge:  #a855f7 (purple)
```

### Dark Theme
```
Background:      #111827
Header:          #1a1a2e
Card:            #1f2937
Border:          #374151
Text:            #f9fafb
Muted:           #a7b0be
Active:          #16a34a
```

Font: `Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

---

## Setup & Testing

### Prerequisites
- Google Chrome
- A Google Cloud project with Calendar and Tasks APIs enabled
- An OAuth 2.0 Client ID (Chrome Extension type)
- A Gemini API key

### Installation

```
1. Clone this repository
2. Create popup/config.js with your API keys:
   var CONFIG = {
     GEMINI_API_KEY: "your-gemini-api-key",
     GOOGLE_CLIENT_ID: "your-client-id.apps.googleusercontent.com"
   };
3. Open chrome://extensions
4. Enable Developer Mode
5. Click "Load unpacked" → select the whatstask-extension/ folder
6. Open web.whatsapp.com
7. Click the WaTask extension icon → test the full flow
8. After code changes → click the refresh icon on the extension card
```

---

## Notes

- **Manifest V3 only.** Uses `service_worker`, not `background.scripts`.
- **No inline JS in HTML** — Chrome CSP blocks it. All JS is in external `.js` files.
- **No eval() or remote scripts** — violates extension CSP.
- **content.js** runs inside WhatsApp Web. It can read the DOM but cannot make cross-origin fetch calls. All API calls go through the background service worker.
- **Timezone** for calendar events: `Africa/Cairo`.
- **API key** must be in `config.js` which is listed in `.gitignore`.
- WhatsApp Web obfuscates class names — the extension uses stable selectors like `[data-id]` and `span[dir]`.
