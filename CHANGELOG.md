# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Light-theme support for Twitch's `tw-root--theme-light` class. Tokens
  re-declared at light-theme values cascade through both the native
  Twitch DOM and 7TV's overridden DOM with no per-rule duplication.
  Pills, sub-notice cards, message text, mentions, links, the ghost
  top-nav indicator, and chat-input chrome all flip to a light-theme
  palette automatically.
- JS-driven theme detection in `badges.js`: tries `tw-root--theme-light`
  first, falls back to body-background luminance, toggles `.gs-light` on
  `<html>`, and observes class mutations for live theme flips.
- 7TV row-hover idle background on action buttons (`rgba(0,0,0,0.5)`),
  bumped to `rgba(0,0,0,0.8)` on direct hover.

### Changed
- `toggle.js` bails on `*.twitch.tv` subdomains where the standard top
  nav anchor doesn't exist (dashboard, safety, m, etc.).
- Sub-notice card padding fix: zero the inner `[data-test-selector=
  "user-notice-line"]` padding explicitly with logical longhands so
  Twitch's hashed `padding-inline` rule no longer bulges the card.
- Username display: dropped hover background tint, kept underline only;
  trimmed lateral padding to `0 5px 0 0`; `white-space: nowrap` so long
  names don't strand the trailing character on light theme.
- Cheer-effect rows defer to Twitch's halo + body wrapper — our card
  background, transition, hover wash, and accent border are dropped on
  the inner `.chat-line__message` so only Twitch's effect renders.
- Chat input box gains a dark-theme inset box-shadow border using
  Twitch's `--input-border-width-small` token; the action-button row
  gets a 12px `margin-block-start` to breathe against it.
- Icon source (`ghost-icon.svg`) and rasterizer (`generate-icons.mjs`)
  now live one level up, shared between this repo and the Firefox repo.
  `npm run icons` invokes the parent script with `./icons` as the target.

### Removed
- `content/resize.js` (was packaged but never loaded by the manifest;
  used `localStorage`, contradicting the README's privacy claim).
- `icons/generate.mjs` and `icons/ghost-icon.svg` from this repo —
  consolidated into the parent folder, see Changed above.

### Fixed
- `.link-fragment:hover` no longer paints Twitch's default hover
  background; underline-only.
- `.chat-line__reply-icon` no longer renders Twitch's residual
  box-shadow ring that doubled up against our row hover border.
- Build's `--ignore-files` now also excludes `scripts/`, `dist/`, and
  `.github/` so the published zip contains exactly `manifest.json`,
  `content/{badges,toggle,twitch-chat}`, and `icons/icon-{48,96,128}.png`.

## [0.1.2] — 2026-04-27

Initial public release. See git history for changes prior to this
changelog file's introduction.
