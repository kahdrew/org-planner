---
name: extension-worker
description: Chrome extension worker for Manifest V3 features including LinkedIn detection, scraping, and side panel UI
---

# Extension Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

**CRITICAL: All code lives at `/Users/andy/Documents/GitHub/relay`. You MUST cd into this directory for all operations.**

## When to Use This Skill

Chrome extension features: Manifest V3 setup, content scripts for LinkedIn, background service worker, side panel UI, popup UI, LinkedIn scraping, campaign management, and extension-to-API communication.

## Required Skills

None. Chrome extensions cannot be tested with agent-browser. Verification is done through automated tests and API-level curl checks.

## Work Procedure

### 1. Understand the Feature

- Read the feature's `description`, `expectedBehavior`, `preconditions`, and `verificationSteps` carefully.
- Read `AGENTS.md` for mission boundaries.
- Read `.factory/library/architecture.md` for extension architecture.
- Read `.factory/research/chrome-extension-mv3.md` for Manifest V3 patterns.
- Read existing extension code in `/Users/andy/Documents/GitHub/relay/packages/chrome-extension/`.

### 2. Write Tests First (TDD)

- Write Vitest tests in `packages/chrome-extension/src/__tests__/` BEFORE implementing.
- Test content script logic (LinkedIn page detection, data extraction) with mocked DOM.
- Test background service worker logic (API communication, auth management) with mocked chrome APIs.
- Test message passing logic between contexts.
- Run tests: `cd /Users/andy/Documents/GitHub/relay && npx vitest run packages/chrome-extension/src/__tests__/<file> --reporter=verbose`
- Confirm tests fail first (red), then implement to pass (green).

### 3. Implement

Follow Manifest V3 patterns from `.factory/research/chrome-extension-mv3.md`.

**Extension structure (packages/chrome-extension):**
```
src/
├── background/       # Service worker: API calls, auth, message routing
│   └── index.ts      # chrome.runtime.onMessage handler, fetch wrapper
├── content/          # Content scripts injected into web pages
│   ├── linkedin/     # LinkedIn-specific detection and overlay
│   └── web/          # General website detection
├── sidepanel/        # Side panel React app (rich UI)
│   ├── main.tsx
│   └── App.tsx
├── popup/            # Extension popup React app
│   ├── main.tsx
│   └── App.tsx
└── shared/           # Shared types, message protocol, utilities
    ├── messages.ts   # Message type definitions
    └── api.ts        # API client for background context
```

**Key patterns:**
- Content script ↔ Background: `chrome.runtime.sendMessage({ type, payload })` with typed message protocol
- Background ↔ API: `fetch()` with JWT from `chrome.storage.local`
- Side panel/Popup use React, built separately via Vite multi-entry config
- Content scripts inject overlay elements into LinkedIn DOM
- LinkedIn page detection: URL pattern matching + DOM observation via MutationObserver
- Data extraction: DOM selectors for profile fields, handle LinkedIn's dynamic rendering
- Rate limiting: all LinkedIn actions go through a rate limiter in the background worker
- Campaign execution: background worker manages timing, content script executes actions

**Chrome APIs used:**
- `chrome.sidePanel` - Side panel management
- `chrome.storage.local` - Token and settings persistence
- `chrome.runtime.sendMessage/onMessage` - Inter-context messaging
- `chrome.tabs.onUpdated` - Page navigation detection
- `chrome.action.setBadgeText` - Badge notification count
- `chrome.alarms` - Campaign scheduling

### 4. Run Validators

```bash
cd /Users/andy/Documents/GitHub/relay && npx vitest run packages/chrome-extension/ --reporter=verbose
cd /Users/andy/Documents/GitHub/relay && npm run typecheck
cd /Users/andy/Documents/GitHub/relay && npm run lint
```

### 5. Verify API Integration

Since the extension cannot be loaded in agent-browser, verify API-level behavior:

1. Ensure API server is running on port 3100.
2. Use curl to test the API endpoints the extension calls.
3. Verify auth token flow works (register, get token, use in API call).
4. For scraping features: verify the API endpoints that receive scraped data work correctly.
5. For campaign features: verify campaign CRUD and execution status endpoints.
6. Record curl commands and responses as `interactiveChecks` entries.

### 6. Build Verification

Build the extension and verify it produces valid output:
```bash
cd /Users/andy/Documents/GitHub/relay/packages/chrome-extension && npm run build
```
Verify the build output contains: manifest.json, background service worker bundle, content script bundle(s), popup/sidepanel HTML + bundles.

### 7. Clean Up

- Stop any processes started.
- Commit changes from `/Users/andy/Documents/GitHub/relay`.

## Example Handoff

```json
{
  "salientSummary": "Implemented LinkedIn profile detection content script and quick-capture feature. Content script detects LinkedIn profile pages via URL pattern + DOM selectors, injects a floating 'Add to Relay' button. Clicking it extracts name/title/company/location from the page DOM and sends to background worker, which POSTs to /api/contacts. Added 6 Vitest tests for detection logic and data extraction. Verified via curl: POST /api/contacts with extracted data returns 201.",
  "whatWasImplemented": "Content script linkedin/detector.ts with URL pattern matching and MutationObserver for SPA navigation. linkedin/extractor.ts extracts profile fields from LinkedIn DOM. linkedin/overlay.ts injects floating button with click handler. Background handler for CAPTURE_PROFILE message type that calls POST /api/contacts. 6 tests covering: profile URL detection, non-profile URL rejection, data extraction from mock DOM, SPA navigation re-detection, overlay injection, message passing.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "cd /Users/andy/Documents/GitHub/relay && npx vitest run packages/chrome-extension/src/__tests__/linkedin-detector.test.ts --reporter=verbose",
        "exitCode": 0,
        "observation": "6 tests passed"
      },
      {
        "command": "cd /Users/andy/Documents/GitHub/relay && npm run typecheck",
        "exitCode": 0,
        "observation": "No type errors"
      },
      {
        "command": "cd /Users/andy/Documents/GitHub/relay/packages/chrome-extension && npm run build",
        "exitCode": 0,
        "observation": "Build output contains manifest.json, content.js, background.js, popup/index.html, sidepanel/index.html"
      }
    ],
    "interactiveChecks": [
      {
        "action": "curl -X POST http://localhost:3100/api/contacts -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{\"name\":\"John Doe\",\"title\":\"CTO\",\"company\":\"Acme Inc\",\"source\":\"linkedin-scrape\"}'",
        "observed": "201 Created with contact object including _id, source field set to 'linkedin-scrape'"
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "packages/chrome-extension/src/__tests__/linkedin-detector.test.ts",
        "cases": [
          {"name": "detects LinkedIn profile URL", "verifies": "URL pattern matching for /in/ paths"},
          {"name": "ignores non-profile LinkedIn URLs", "verifies": "Feed, messaging, etc. not detected"},
          {"name": "extracts profile data from DOM", "verifies": "Name, title, company extracted correctly"},
          {"name": "handles missing DOM elements", "verifies": "Returns partial data when elements missing"}
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- API endpoints the extension depends on don't exist yet
- Manifest V3 API limitations block the feature (document the specific limitation)
- LinkedIn DOM structure assumptions are incorrect (can't verify without real LinkedIn)
- Chrome API behavior differs from documentation
- Extension build fails due to Vite configuration issues
- Feature requires real LinkedIn authentication which isn't available
