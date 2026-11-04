# Browser tab icon

Replace **`apps/web/public/favicon.png`** with your own square PNG image. The current placeholder is the existing soccer-ball icon. A 192 x 192 or 512 x 512 PNG works well; use a simple design that stays recognizable at browser-tab size (often 16 x 16 or 32 x 32). Keep the filename and PNG format to avoid changing any code.

Angular copies this file to `/favicon.png` during the build. Both the main app and shared-game landing pages reference that same file as their favicon and Apple touch icon. Commit the replacement and deploy through the existing GitHub pipeline. Browsers may retain the old favicon; try a fresh browser session or clear cached site files if it persists.

If you choose a different filename or file format, update the links in `apps/web/src/index.html` and `apps/api/src/event-sharing.ts` (including the favicon MIME type). The separate soccer-ball fallback for game-preview photos remains in `apps/api/assets/soccer-ball.png`.
