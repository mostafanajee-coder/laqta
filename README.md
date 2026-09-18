# Laqta (لقطة) — Full Page Screenshot

<p dir="rtl">

إضافة متصفح مجانية ومفتوحة المصدر (Manifest V3) لالتقاط لقطات الشاشة: الصفحة كاملة، أو الجزء المرئي، أو منطقة محددة. تُحفظ اللقطة بصيغة PNG أو JPG أو PDF، أو تُنسخ إلى الحافظة، أو تُطبع. الواجهة متاحة بالعربية والإنجليزية مع دعم كامل للاتجاه من اليمين إلى اليسار.

</p>

A free, open-source browser extension (Manifest V3) that captures the full page, the visible part, or a selected area, and saves it as PNG, JPG, or PDF, copies it, or prints it. The interface is available in Arabic and English with full right-to-left support.

## Features

- **Full page** capture: scrolls the page, captures each screen, and stitches the tiles into one image. Fixed headers and sticky bars are hidden after the first screen so they do not repeat.
- **Visible part** and **selected area** (drag a rectangle on the page, Esc to cancel).
- **Save as PNG, JPG, or PDF.** The PDF is written by the extension itself, with no third-party library.
- **Copy** to the clipboard and **print**.
- **History** of captures stored locally in IndexedDB, with configurable retention.
- **Filename templates** with tokens such as `{title}`, `{domain}`, `{date}`, `{time}`, `{n}`.
- **Keyboard shortcuts** and a right-click context menu.
- **Arabic and English** interface; the language can follow the browser or be chosen in Options.
- Light and dark themes.
- No network requests, no analytics, no accounts. Only `activeTab`, `scripting`, `storage`, `downloads`, and `contextMenus` permissions.

## Install (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.

Shortcuts (changeable at `chrome://extensions/shortcuts`):

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Capture full page | `Alt+Shift+1` | `Cmd+Shift+1` |
| Capture visible part | `Alt+Shift+2` | `Cmd+Shift+2` |
| Capture selected area | `Alt+Shift+3` | `Cmd+Shift+3` |

## Development

There is no build step; the extension runs directly from the source.

```bash
npm run validate   # static checks: manifest, locales, HTML, JS syntax, CSP rules
npm test           # unit tests (node --test)
npm run icons      # regenerate icons/*.png from tools/make-icons.mjs
```

Both checks run in GitHub Actions on every push.

### Layout

```
manifest.json
_locales/{en,ar}/messages.json   translations
src/background/                  service worker, capture orchestration, injected page functions
src/content/selection.js         area-selection overlay
src/lib/                         pure modules: i18n, settings, filename, pdf, tiles, db, image
src/popup/  src/options/  src/viewer/  src/history/   extension pages
src/styles/base.css              shared design tokens (logical properties for RTL)
tools/                           validator and icon generator
test/                            unit tests for the pure modules
```

### Adding a language

1. Copy `_locales/en/messages.json` to `_locales/<code>/messages.json` and translate the messages.
2. Add the code to `SUPPORTED_LANGUAGES` in `src/lib/i18n.js` and an `<option>` in `src/options/options.html`.
3. Run `npm run validate`; it fails if any key is missing or a placeholder differs.

## Limitations

- Browser-internal pages (`chrome://`, the extension store) cannot be captured; the browser blocks it.
- Very tall pages are trimmed at the maximum canvas size (16384 device pixels) and the viewer says so.
- Pages that lazy-load content while scrolling may show placeholders in parts of a full-page capture.

## License

MIT. See [LICENSE](LICENSE).
