# Chrome Extension Manifest V3 — Research & Patterns

> Sources: [Chrome Extensions Develop](https://developer.chrome.com/docs/extensions/develop), [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [Message Passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging), [Service Workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers)

---

## 1. Manifest V3 Structure (for Relay)

```json
{
  "manifest_version": 3,
  "name": "Relay",
  "version": "1.0.0",
  "description": "Sales intro request & prospecting platform",
  "permissions": [
    "sidePanel",
    "storage",
    "activeTab",
    "scripting",
    "tabs"
  ],
  "host_permissions": [
    "https://www.linkedin.com/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_title": "Open Relay",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["https://www.linkedin.com/*"],
      "js": ["content-script.js"],
      "css": ["content-styles.css"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["images/*", "fonts/*"],
      "matches": ["https://www.linkedin.com/*"]
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

---

## 2. Content Scripts — LinkedIn Page Injection

Content scripts run in the context of web pages in an **isolated world** (separate JS environment, shared DOM).

### Available Chrome APIs in Content Scripts
- `chrome.storage` (direct)
- `chrome.runtime.sendMessage()` / `chrome.runtime.onMessage`
- `chrome.runtime.connect()` / `chrome.runtime.onConnect`
- `chrome.runtime.getURL()` — for loading extension assets
- `chrome.runtime.id`

All other APIs must be accessed via **message passing** to the background service worker.

### Static Declaration Pattern (manifest.json)
```json
{
  "content_scripts": [
    {
      "matches": ["https://www.linkedin.com/*"],
      "js": ["content-script.js"],
      "css": ["content-styles.css"],
      "run_at": "document_idle"
    }
  ]
}
```

### Programmatic Injection (from service worker)
```js
// service-worker.js
chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content-script.js']
  });
});
```

### LinkedIn Content Script Pattern
```typescript
// content-script.ts
(() => {
  // Check if already injected
  if (document.querySelector('#relay-root')) return;

  // Create injection container
  const container = document.createElement('div');
  container.id = 'relay-root';
  document.body.appendChild(container);

  // Observe LinkedIn SPA navigation
  const observer = new MutationObserver((mutations) => {
    // Detect profile page navigation
    if (window.location.pathname.startsWith('/in/')) {
      injectProfileUI();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial check
  if (window.location.pathname.startsWith('/in/')) {
    injectProfileUI();
  }

  function injectProfileUI() {
    // Extract profile data from DOM
    const profileData = extractProfileData();
    // Send to background for processing
    chrome.runtime.sendMessage({
      type: 'PROFILE_DETECTED',
      data: profileData
    });
  }

  function extractProfileData() {
    return {
      name: document.querySelector('.text-heading-xlarge')?.textContent?.trim(),
      title: document.querySelector('.text-body-medium')?.textContent?.trim(),
      company: document.querySelector('.pv-text-details__right-panel .inline-show-more-text')?.textContent?.trim(),
      url: window.location.href
    };
  }
})();
```

### Security Considerations
- Content scripts are **less trustworthy** than the service worker — always validate messages from them
- Never use `eval()` or `innerHTML` with untrusted data
- Use `JSON.parse()` and `innerText` for safe data handling

---

## 3. Background Service Worker

Service workers in MV3 are **event-driven** and can go **dormant** when idle. They have no DOM access.

### Key Patterns
```typescript
// background.ts (service-worker)

// ---- Lifecycle Events ----
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // First install setup
    chrome.storage.local.set({ setupComplete: false });
  }
});

// ---- API Communication ----
async function callRelayAPI(endpoint: string, data: any, token: string) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

// ---- Handle Messages from Content Scripts ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROFILE_DETECTED') {
    handleProfileDetected(message.data).then(sendResponse);
    return true; // Keep channel open for async response
  }
  if (message.type === 'REQUEST_INTRO') {
    handleIntroRequest(message.data).then(sendResponse);
    return true;
  }
});

// ---- Side Panel Management ----
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Enable side panel only on LinkedIn
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  const url = new URL(tab.url);
  if (url.hostname === 'www.linkedin.com') {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html',
      enabled: true
    });
  } else {
    await chrome.sidePanel.setOptions({ tabId, enabled: false });
  }
});
```

### Service Worker Lifecycle Notes
- Goes **idle after ~30 seconds** of inactivity (then terminated)
- Wakes on registered events (messages, alarms, etc.)
- Cannot use `setTimeout`/`setInterval` for long-running timers → use `chrome.alarms` instead
- Use `chrome.storage` instead of global variables (state is lost on shutdown)

---

## 4. Side Panel API

Available since Chrome 114+, MV3 only. Side panel persists across tab navigation.

### Setup
```json
// manifest.json
{
  "permissions": ["sidePanel"],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_title": "Click to open Relay"
  }
}
```

### Key Methods
```typescript
// Open panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Programmatic open (requires user gesture)
chrome.sidePanel.open({ windowId: tab.windowId });

// Tab-specific panel
chrome.sidePanel.setOptions({
  tabId,
  path: 'sidepanel.html',
  enabled: true
});

// Close panel (Chrome 141+)
chrome.sidePanel.close({ windowId: tab.windowId });

// Listen for open/close events (Chrome 141+/142+)
chrome.sidePanel.onOpened.addListener((info) => {
  console.log('Panel opened', info.path, info.windowId);
});
chrome.sidePanel.onClosed.addListener((info) => {
  console.log('Panel closed', info.path, info.windowId);
});
```

### Side Panel with React
The `sidepanel.html` file loads a React app — it's a standard extension page with full Chrome API access.

```html
<!-- sidepanel.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Relay</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./src/sidepanel/main.tsx"></script>
</body>
</html>
```

---

## 5. Storage API

Four storage areas available:

| Area | Size Limit | Sync? | Use Case |
|------|-----------|-------|----------|
| `storage.local` | ~10 MB | No | User data, cached profiles |
| `storage.sync` | ~100 KB | Yes (Chrome account) | User preferences |
| `storage.session` | ~10 MB | No (cleared on restart) | Temporary auth tokens |
| `storage.managed` | Read-only | Enterprise policy | IT admin config |

### Usage Pattern
```typescript
// Store auth token in session storage (cleared when browser closes)
await chrome.storage.session.set({ authToken: 'jwt-token-here' });

// Read stored data
const { authToken } = await chrome.storage.session.get('authToken');

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.authToken) {
    console.log('Auth token updated');
  }
});

// Store user preferences (syncs across devices)
await chrome.storage.sync.set({ defaultProvider: 'openai' });
```

---

## 6. Message Passing — Full Architecture

### One-Time Messages
```typescript
// content-script.ts → service-worker.ts
const response = await chrome.runtime.sendMessage({
  type: 'GET_PROFILE_INSIGHTS',
  profileUrl: window.location.href
});

// service-worker.ts → content-script.ts (requires tabId)
const response = await chrome.tabs.sendMessage(tabId, {
  type: 'HIGHLIGHT_PROFILE',
  data: { connectionPath: ['Alice', 'Bob'] }
});
```

### Long-Lived Connections (for streaming)
```typescript
// content-script.ts
const port = chrome.runtime.connect({ name: 'ai-stream' });
port.postMessage({ type: 'START_AI_ANALYSIS', profile: profileData });
port.onMessage.addListener((msg) => {
  if (msg.type === 'AI_CHUNK') {
    appendToUI(msg.text);
  } else if (msg.type === 'AI_DONE') {
    finalizeUI();
  }
});

// service-worker.ts
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ai-stream') return;
  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'START_AI_ANALYSIS') {
      // Stream AI response back through port
      const stream = await getAIAnalysis(msg.profile);
      for await (const chunk of stream) {
        port.postMessage({ type: 'AI_CHUNK', text: chunk });
      }
      port.postMessage({ type: 'AI_DONE' });
    }
  });
});
```

### Side Panel ↔ Service Worker
Side panel pages are extension pages — they use `chrome.runtime.sendMessage()` just like content scripts:
```typescript
// sidepanel.tsx
const response = await chrome.runtime.sendMessage({
  type: 'SUBMIT_INTRO_REQUEST',
  data: formData
});
```

### Typed Message Pattern (recommended)
```typescript
// shared/messages.ts
type Message =
  | { type: 'PROFILE_DETECTED'; data: ProfileData }
  | { type: 'REQUEST_INTRO'; data: IntroRequest }
  | { type: 'GET_PROFILE_INSIGHTS'; profileUrl: string }
  | { type: 'AI_CHUNK'; text: string }
  | { type: 'AI_DONE' };

type MessageResponse<T extends Message['type']> =
  T extends 'GET_PROFILE_INSIGHTS' ? ProfileInsights :
  T extends 'REQUEST_INTRO' ? IntroResponse :
  void;
```

---

## 7. Build Tooling — Vite for Chrome Extensions

Use `@crxjs/vite-plugin` or `vite-plugin-web-extension` for building Chrome extensions with Vite:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest })
  ]
});
```

This provides HMR for the side panel and popup, auto-reloading content scripts, and TypeScript/JSX support out of the box.
