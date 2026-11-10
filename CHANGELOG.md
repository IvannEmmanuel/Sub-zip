# Changelog

Versions follow `MAJOR.MINOR.PATCH`. A release is created automatically when a tag like `v0.2.0` is pushed.

## 0.2.1
- Subtitles on more sites: if the captions are drawn by the page around the player frame, they are now read from there.
- If a site loads one subtitle file and its captions cannot be read as text, that file is used (the file matching your language is chosen when there are several; thumbnail tracks are ignored).
- Fixed captions being skipped inside players whose wrapper class mentions "controls".

## 0.2.0
- Picture-in-Picture for players inside iframes (most anime and movie sites): full controls, volume, seek bar, ±10 s.
- Skip intro / opening / recap / credits button in the PiP window when the site has one.
- Next episode button: uses the site's own button, a `rel="next"` link, or the episode list on the page.
- The PiP window stays open and reattaches when the next episode loads in the player.
- Subtitle size, up/down and hide now also work on captions that the site draws itself.
- No more caption delay while you are on another tab: text is timed from the video clock, using the subtitle file the page loaded (`.vtt`, `.srt`, `.ass`) or the browser's text tracks.
- Captions found on any site: an on-screen text reader catches subtitles from players the extension does not know by name.
- Press **D** in the PiP window for a diagnostics box that shows where the captions come from.
- Dark/clean popup redesign, volume slider, reels follow.

## 0.1.0
- First version: subtitles in Document Picture-in-Picture for YouTube, HTML5 `<track>`, page captions and `.srt`/`.vtt` files.
