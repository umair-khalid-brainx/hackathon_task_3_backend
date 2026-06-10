# Focus Mode Activator

Chrome extension (Manifest V3) that blocks browser notifications when Focus Mode is on.

## File structure

```
.
├── manifest.json                 # Extension config and entry points
├── background/
│   └── service-worker.js         # Background logic (toggle, blocking, stats)
├── popup/
│   ├── popup.html                # Toolbar popup UI
│   ├── popup.css
│   └── popup.js
├── content/
│   └── content-script.js         # Page-level hooks (not wired yet)
├── options/
│   ├── options.html              # Settings page (not wired yet)
│   ├── options.css
│   └── options.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder

## Current behavior

- Toggle **Block notifications** in the toolbar popup to turn Focus Mode on or off
- **Keyboard shortcut:** `Alt+Shift+F` (Mac: `Option+Shift+F`) toggles Focus Mode
- **Auto-schedule:** up to 3 daily time ranges in extension settings
- **Whitelist:** up to 20 domains that keep notification access while Focus Mode is on
- When ON, the extension blocks site notification permission via `contentSettings` and intercepts page `Notification` calls
- Turning Focus Mode off shows a session summary in the popup (including after using the keyboard shortcut)
- Scheduled stop times only affect sessions that the schedule started — manual sessions are not auto-stopped
- State persists across browser restarts via `chrome.storage`

> Customize or fix shortcuts at `chrome://extensions/shortcuts` if the default does not register.

## Next steps

- Additional polish and testing
