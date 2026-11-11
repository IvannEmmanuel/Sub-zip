<p align="center"><img src="assets/logo-512.png" alt="Sub PiP logo" width="120"></p>

<h1 align="center">Sub PiP</h1>

<p align="center">
  Keep subtitles on screen in Picture-in-Picture, and learn from them while you watch.<br>
  A free Chrome / Edge extension for YouTube, anime and movie sites, Facebook reels and local subtitle files.
</p>

<p align="center">
  <a href="../../releases/latest"><b>Download</b></a> ·
  <a href="#install">Install</a> ·
  <a href="#how-to-use">How to use</a> ·
  <a href="#keyboard-shortcuts">Shortcuts</a> ·
  <a href="#troubleshooting">Troubleshooting</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

---

## What it does

Chrome's own Picture-in-Picture window shows only the video, so the subtitles disappear. Sub PiP opens its own PiP window that keeps them, with a full set of controls.

- **Subtitles that stay.** Works with the site's own subtitles, captions drawn on the page, and `.srt` / `.vtt` files you load yourself.
- **Works inside players on other sites.** Most anime and movie sites put the video in an embedded player. Those get the same window, with volume, seek bar, ±10 s and subtitles.
- **Next episode and skip intro.** Buttons appear in the PiP window when the site has them. The window stays open and picks up the next episode.
- **Seek preview.** Hover the seek bar to see the site's preview picture.
- **Learning tools.** Look up words, replay and loop lines, hide lines until you ask, save words and screenshots.

## Install

Chrome and Edge, version 116 or newer. Nothing is installed from a store, so it takes a minute.

1. Open the [latest release](../../releases/latest) and download `sub-pip-vX.Y.Z.zip`.
2. Extract it to a folder you will keep (Chrome reads it every time it starts, so don't delete it).
3. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
4. Click **Load unpacked** and choose the extracted folder.

**To update:** download the new zip, extract it over the old folder, then click the reload icon on the extension card. Refresh any open video tab afterwards.

<details>
<summary>Install from the source download instead</summary>

1. On GitHub click **Code → Download ZIP** and extract it to a folder you will keep.
2. Load unpacked as above, but choose the **`dist`** folder inside it.
</details>

## How to use

1. Start a video with subtitles turned on in the site's own player.
2. Hover the video and click **PiP + subs**. You can also click the toolbar icon or press `Alt+P` (change it at `chrome://extensions/shortcuts`).
3. Hover the PiP window to show the controls.

The toolbar popup has three tabs: **Player** (subtitle source, load a file), **Style** (size, colour, position) and **Tools** (translation, learning options, saved words, history).

## Features

### Watching

| Feature | How it works |
|---|---|
| **Next episode** | A button appears when the site has a next episode. It finds the site's own button, or the next item in the episode list. |
| **Skip intro** | When the site shows "Skip intro / opening / recap / credits", a Skip button appears (`S`). |
| **Seek preview** | Hover the seek bar for the site's thumbnail picture, when the site has one. |
| **Open PiP when you leave the tab** | Popup → Tools. Uses Chrome's automatic PiP (Chrome 134+; allow it for the site when Chrome asks). Brave and Firefox don't support it. |
| **Subtitle style** | Size, colour, outline, background, position and font in the popup's Style tab, or the buttons in the PiP window. |

### Learning

Open the tools panel with the sliders button or `G`. Every option is explained there.

| Feature | Key | What it does |
|---|---|---|
| **Translation** | `T` | Cycle Off → Dual (original + translation) → Translated only. Language is set in popup → Tools. |
| **Click a word** | click | Shows its translation and dictionary entry. The video pauses while the card is open. |
| **Hover to look up** | `W` | Rest the pointer on a word to see its meaning. Move away and the video resumes. |
| **Replay line** | `R` | Jump back to the start of the current line. |
| **Loop line** | `O` | Repeat the current line until you turn it off. |
| **Study mode** | `E`, then `X` | Lines stay hidden until you press `X` or click "Show line". |
| **Dim when silent** | `Q` | Fades the picture while nobody talks. |
| **History** | `H` | Every line shown so far. Click a line to jump back, or a word to look it up. |
| **Saved words** | star | The star in a word's card saves it with the line it came from and a small picture of the scene. Download them as a CSV (opens in Excel, imports into Anki) from popup → Tools. |
| **Screenshot** | `P` | Saves the current picture as a PNG, with the subtitle line. |
| **Save lines as .srt** | History panel | Downloads the lines shown so far as a subtitle file. |
| **Continue where you stopped** | automatic | Videos longer than 10 minutes offer "Continue from m:ss" when you come back. |

## Keyboard shortcuts

These work while the PiP window is focused.

| Playback | | Subtitles and study | |
|---|---|---|---|
| `Space` / `K` | Play / pause | `C` | Subtitles on / off |
| `J` / `L` | Back / forward 10 s | `+` / `-` | Subtitle size |
| `←` / `→` | Back / forward 5 s (Shift: 10 s) | `T` | Translation mode |
| `↑` / `↓` | Volume | `H` | History |
| `M` | Mute | `R` / `O` | Replay / loop line |
| `S` | Skip intro | `W` | Hover to look up |
| `P` | Screenshot | `E` / `X` | Study mode / show line |
| `G` | Tools panel | `Q` | Dim when silent |
| `D` | Diagnostics box | `Esc` | Close card or panel |

## Privacy

- Everything stays on your computer except lookups and translation.
- **Only when translation is on, or you click or hover a word,** the line or word is sent to Google Translate (falling back to MyMemory) and, for English words, to dictionaryapi.dev. No AI model is used, and nothing else from the page is sent.
- Saved words, screenshots and video positions are stored in the browser on this computer only.

## Troubleshooting

**Subtitles don't show on a site**
1. Reload the extension, then **refresh the video tab** (pages opened before a reload keep the old code).
2. Turn subtitles on in the site's own player, play for a few seconds, then open PiP.
3. Press **D** in the PiP window. The box shows where the extension looks for captions. Send a screenshot of it with the site name when reporting a problem.
4. As a last resort, use **Load .srt / .vtt file** in the popup.

**"No video found" in the popup**
Refresh the page once after installing or reloading the extension, and start the video first.

**Word lookup says it can't connect**
The lookup services are free and can be busy or blocked. Content blockers such as Brave Shields can block them. Try again, or turn the blocker off for the site.

## Limits

- Subtitles burned into the video picture cannot be separated from it.
- Videos protected by DRM may not play in the PiP window, and screenshots are not possible for them.
- If a site reloads the whole page for the next episode, the PiP window closes. Reopen it with `Alt+P`.
- The seek preview needs the site to provide thumbnails.
- Chrome's own fallback PiP window (used when custom PiP isn't possible) has no buttons beyond play/pause, mute and Skip Ad, and none of the learning tools.

## For developers

```bash
npm install
npm run dev      # builds to dist/ with hot reload; load dist/ unpacked once
npm test         # unit tests
npm run build    # production build into dist/ (dist/ is committed so ZIP downloads work)
```

Built with Chrome Manifest V3, TypeScript, Vite and `@crxjs/vite-plugin`, Preact and Tailwind for the popup, and Vitest for tests. In dev mode the dev server must be running. Reload the extension card after changing `manifest.config.ts`. A manual test page is at `tests/manual/demo.html`.

**Releasing:** bump the version in `package.json` and `manifest.config.ts`, add a section to `CHANGELOG.md`, then push a tag like `v0.3.0`. GitHub Actions builds the zip and creates the release.
