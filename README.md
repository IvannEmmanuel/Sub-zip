# Sub PiP

Chrome extension that keeps subtitles visible in Picture-in-Picture (YouTube, HTML5 `<track>`, page captions, `.srt`/`.vtt` files). Needs Chrome/Edge 116+.

## Install (friends)
1. On GitHub click **Code → Download ZIP** and **extract it to a permanent folder** (Chrome reads from it every launch; don't delete it).
2. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the **`dist`** folder inside the extracted folder.
4. To update: download the new ZIP, replace the folder's contents, then click the reload icon on the extension card.
## Use
Hover a video and click **PiP + subs**, or click the toolbar icon, or press `Alt+P` (rebind at `chrome://extensions/shortcuts`).

## Features
- **Translation / dual subtitles** (popup → Tools): show the translation instead of, or under, the original line. Press `T` in the PiP window to cycle Off → Dual → Translated.
- **Click a word** in the PiP window for a translation and dictionary entry (the video pauses while the card is open; `Esc` closes it).
- **Subtitle history**: press `H` in the PiP window (or open popup → Tools) and click a line to jump back to it.
- **Open PiP when you leave the tab** (popup → Tools): uses Chrome's automatic Picture-in-Picture, so allow "Automatic picture-in-picture" for the site when Chrome asks. Chrome 134+ only; Brave and Firefox do not support it (use `Alt+P` there).
- **Keyboard shortcuts in the PiP window**: `Space`/`K` play, `J`/`L` ∓10 s, ←/→ ∓5 s (Shift ∓10 s), ↑/↓ volume, `M` mute, `C` subtitles on/off, `+`/`-` subtitle size, `H` history, `T` translation.

Click-a-word, the history panel and the shortcuts need the Document PiP window (Chrome 116+, top page). Players inside iframes fall back to Chrome's classic PiP, which still shows translated / dual subtitles but cannot host buttons.

**Privacy:** nothing is sent anywhere unless translation is on or you click a word. Then the subtitle line / word goes to Google Translate (falling back to MyMemory) and, for English words, dictionaryapi.dev.

## Develop
```bash
npm install
npm run dev     # builds to dist/ with hot reload; load dist/ unpacked once
npm test        # unit tests
npm run build   # production build into dist/ (commit dist/ so ZIP downloads just work)
```
In dev mode the extension needs the dev server running. Content-script edits reload the page automatically; popup edits hot-reload. Reload the extension card manually after changing `manifest.config.ts`.
Manual test page: `tests/manual/demo.html`.
