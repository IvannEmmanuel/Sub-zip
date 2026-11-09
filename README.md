# Sub PiP

Chrome extension that keeps subtitles visible in Picture-in-Picture (YouTube, HTML5 `<track>`, page captions, `.srt`/`.vtt` files). Needs Chrome/Edge 116+.

## Install (friends)
1. Download [`sub-pip.zip`](https://github.com/IvannEmmanuel/Sub-zip/raw/main/sub-pip.zip) (always the latest build) and **extract it to a permanent folder** (Chrome reads from it every launch; don't delete it).
2. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the extracted folder.
4. To update: replace the folder's contents with the new zip, then click the reload icon on the extension card.

## Use
Hover a video and click **PiP + subs**, or click the toolbar icon, or press `Alt+P` (rebind at `chrome://extensions/shortcuts`).

## Develop
```bash
npm install
npm run dev     # builds to dist/ with hot reload; load dist/ unpacked once
npm test        # unit tests
npm run zip     # production build + sub-pip.zip to share
```
In dev mode the extension needs the dev server running. Content-script edits reload the page automatically; popup edits hot-reload. Reload the extension card manually after changing `manifest.config.ts`.
Manual test page: `tests/manual/demo.html`.
