# GhostSplit Chat Theme for Twitch.tv

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-purple.svg)](./manifest.json)

A browser extension that restyles native [twitch.tv](https://www.twitch.tv) chat
to match the look of [GhostSplit](https://ghostsplit.gg)'s split-view chat
client: tighter rows, softer per-user colors, and GhostSplit-style text-pill
badges (`SUB`, `MOD`, `VIP`, `FOUNDER`, `TURBO`, `PRIME`, `BITS`, `ADMIN`,
`STAFF`, `GMOD`) instead of Twitch's noisy image badges.

Works equally well on **native Twitch chat** and on chat rendered by
**[7TV](https://7tv.app)**, so 7TV / BetterTTV / FrankerFaceZ can stay
installed alongside without breaking.

---

## Features

- **Text-pill badges.** Image badges next to usernames are replaced by
  compact role chips. Custom channel sub badges and event badges are
  hidden so the row stays clean. Spanish + English Twitch UI locales are
  both mapped.
- **Softened username colors.** Neon-bright Twitch usernames are mixed
  toward a light base and re-darkened if luminance gets too high, using
  the exact `softenChatColor` algorithm from GhostSplit's own chat
  client. Reds, yellows, and lime greens stay readable on dark
  backgrounds.
- **Tighter row chrome.** Reduced padding, baseline-aligned badges +
  usernames, hard cap on inline emote heights (no more giant 7TV emotes
  blowing up rows), faint card tint on each row.
- **Distinct system rows.** Channel-points redeems get a red card with a
  4 px left rail; watch-streak milestones get a gold card; sub / resub /
  raid notices get a blue notice card. Inline reply quotes get a purple
  left rail so threads read as separate.
- **Dual-DOM coverage.** Every visual rule is paired between the native
  Twitch DOM (`.chat-line__message`) and 7TV's overridden DOM
  (`.seventv-message`).
- **Loaded indicator.** A small ghost icon is injected into Twitch's top
  navigation as a passive "loaded" badge, with a hover tooltip. The icon
  is non-interactive — this extension is purely visual.
- **No data collection.** No network requests, no analytics, no tracking,
  no storage permission. The extension only needs `host_permissions` for
  `*://*.twitch.tv/*`. Everything else is pure DOM + CSS.

## Preserved on purpose

- Bits / cheer button
- Channel-points balance + claim flow
- All redeem / milestone / cheer-tier badges
- Twitch's collapse-chat and theatre-mode controls
- 7TV's settings button and emote menu

---

## Install

### Firefox (sideload, temporary)

1. Download or build a `.xpi` (see [Build](#build) below).
2. Open `about:debugging#/runtime/this-firefox`.
3. *Load Temporary Add-on…* → pick the `.xpi` (or pick `manifest.json`
   directly from a clone of this repo for live development).
4. Visit any twitch.tv channel — the chat is restyled instantly. A small
   ghost icon appears in the top-right of the nav.

### Firefox (permanent, from AMO)

Submission to [addons.mozilla.org](https://addons.mozilla.org/) pending.

---

## Project layout

```
.
├── manifest.json                  Manifest V3 declaration
├── content/
│   ├── twitch-chat.css            All visual rules, scoped to .chat-shell
│   ├── badges.js                  Image badge → text pill swap
│   │                              + username color softening
│   └── toggle.js                  Top-nav "loaded" indicator
├── icons/
│   ├── ghost-icon.svg             Source SVG for PNG icons
│   ├── icon-{48,96,128}.png       Generated icons (referenced by manifest)
│   └── generate.mjs               Icon regeneration script (sharp)
├── README.md
└── LICENSE
```

`icons/generate.mjs` and `icons/ghost-icon.svg` are dev-time only and are
excluded from the published `.zip` / `.xpi` by the build script.

### Inter-script protocol

`badges.js` and `toggle.js` communicate via two custom `window` events
so neither has to expose globals across content-script worlds:

| Event       | Sender      | Receiver    | Effect                                                           |
| ----------- | ----------- | ----------- | ---------------------------------------------------------------- |
| `gs-rescan` | `toggle.js` | `badges.js` | Re-process every existing message row (currently unused, but the listener is in place for a future on/off control). |
| `gs-reset`  | `toggle.js` | `badges.js` | Undo all DOM-level changes: remove pills, restore hidden image badge wrappers, drop softened username colors. |

---

## Build

A `.zip` archive (for AMO upload — Firefox accepts the same archive as
`.xpi` for direct sideload) is produced by [Mozilla's
`web-ext`](https://github.com/mozilla/web-ext), invoked through `npx`
so there are no permanent runtime dependencies.

```bash
npm run lint     # validate manifest + content scripts via web-ext lint
npm run build    # produce ./dist/<name>-<version>.zip
npm run icons    # (re)generate icons/icon-{48,96,128}.png from the SVG
```

The build excludes `icons/generate.mjs`, `icons/ghost-icon.svg`,
`package.json`, `README.md`, `LICENSE`, and `.gitignore` from the
package — only the actual extension files (`manifest.json`,
`content/*`, `icons/*.png`) ship to users.

`npm run icons` requires `sharp`. Install it once with
`npm install sharp --no-save` (it's intentionally not declared in
`package.json` because it's only needed when re-rasterizing the icon).
Re-run only when `icons/ghost-icon.svg` changes.

---

## Releases

Tagged releases are built and published automatically by the
[`Release` GitHub Actions workflow](./.github/workflows/release.yml).
To cut a new release:

```bash
# bump the version in manifest.json + package.json first, then:
git commit -am "Release v0.1.1"
git tag v0.1.1
git push origin main --tags
```

The workflow lints, builds the extension, copies the `.zip` as `.xpi`,
and publishes a GitHub Release at the tag with both archives attached
and auto-generated release notes from the commit log. The `.zip` is the
artifact you upload to AMO; the `.xpi` is for direct sideload.

Manual dispatch is also available from the Actions tab if you want to
re-run a release for an existing tag.

The lighter [`CI` workflow](./.github/workflows/ci.yml) runs `npm run
lint` + `npm run build` on every push to `main` and on every PR, so
broken commits don't sit unnoticed between releases.

---

## Compatibility notes

- **Firefox** 142+ (because the manifest declares
  `data_collection_permissions`, which was introduced in Fx 142).
- **Twitch locale**: badge mapping handles `es` and `en`. Adding a new
  locale = adding patterns to `BADGE_MAP` in `content/badges.js`.

---

## Privacy

This extension does not:

- send network requests,
- read or write `localStorage` / `sessionStorage` / cookies,
- request `storage`, `tabs`, `webRequest`, `scripting`, or any other
  permission beyond `host_permissions: *://*.twitch.tv/*`,
- include any analytics / telemetry / remote code,
- touch any URL outside twitch.tv.

`browser_specific_settings.gecko.data_collection_permissions` is
explicitly set to `{ "required": ["none"] }`.

---

## Contributing

Issues and PRs welcome. The codebase is small and intentionally CSS-first
— anything that can be a CSS rule should be one; JS is reserved for cases
that fundamentally need DOM mutation (current cases: `alt`-text badge
synthesis, color softening).

When adding a new role pill, edit `BADGE_MAP` in `content/badges.js` and
the matching `.gs-badge-<role>` color rule in `content/twitch-chat.css`.

---

## License

[MIT](./LICENSE) © GhostSplit.gg
