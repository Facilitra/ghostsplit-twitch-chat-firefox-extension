# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/).

## [0.3.0] — 2026-05-20

### Added
- **Cross-repo content-script sync.** `sync-content.mjs` (at the parent
  folder, sibling of both repos) mirrors `content/badges.js`,
  `content/toggle.js`, and `content/twitch-chat.css` from the canonical
  Chromium repo to this one. Modes: write, `--check`, `--from=firefox`.
  Wired into `package.json` as `sync`, `sync-check`, and a `prelint`
  hook that fails fast on drift. No-ops when only one repo is checked
  out (CI-safe).
- **`gs-row-*` shared class layer.** New `tagRowParts()` pass in
  `badges.js` stamps `gs-row`, `gs-row-frame`, `gs-row-time`,
  `gs-row-user`, `gs-row-badges`, `gs-row-name`, `gs-row-body`,
  `gs-row-text`, `gs-row-mention`, `gs-row-link`, `gs-row-emote`,
  `gs-row-emote-big` on both vanilla and 7TV row parts so a single
  selector set styles both renderers. Existing native + 7TV paired
  selectors stay as pre-paint fallbacks (the window between
  `document_start` CSS injection and `document_idle` JS boot).
- **Notice family system.** `processNativeSubNotice` rewritten into
  `processNativeNotice` + `classifyNoticeText()` returning one of
  `sub | gift | raid | milestone | bits | announce | ratelimit`. The
  notice card now carries `data-gs-notice-kind` and gets a per-kind
  palette + per-kind inline SVG icon (star / gift box / megaphone /
  flame / lightning / speaker / triangle). Light-theme variants for
  every kind.
- **Twitch broadcaster announcement card** (`.announcement-line` with
  `--primary | --blue | --orange | --green | --purple` palette
  modifiers, plus the inline `style="border-color: rgb(...)"` custom
  color path). Embedded `chat-line--inline.chat-line__message` flattens
  cleanly inside the announcement chrome.
- **7TV broadcaster announcement card**
  (`.seventv-announce-message-container.announcement-line--*`) — new
  container class discovered in `chat-example-09-7tv`. Same palette
  modifier system as vanilla.
- **7TV `has-highlight` per-label palette.** Picks up
  `--seventv-highlight-color` / `--seventv-highlight-dim-color` CSS
  vars from 7TV's inline style so unknown labels (Subscriber Only,
  Returning Chatter, …) automatically get the right hue. The empty
  `.seventv-chat-message-highlight-label` element renders its text
  from the `data-highlight-label` attribute via `::before`. 7TV's
  spurious `::after` (which paints `"0"` from `data-highlight-style`)
  is suppressed.
- **7TV deleted / timed-out message** (`.seventv-user-message.deleted`
  + `.seventv-chat-message-moderated` reason footer).
- **7TV ban slider** (`.seventv-ban-slider`) — moderator swipe-to-ban
  widget; styling pass on the track tints plus full preservation block
  entry so the drag affordance stays interactive.
- **7TV paint guard** for `.seventv-painted-content.seventv-paint` so
  our rules don't clobber 7TV's animated paid-username gradients.
- **7TV URL token** (`a.link-part`) styled to match vanilla
  `a.link-fragment`.
- **7TV rich-embed card** for clip / VOD / channel previews
  (`.seventv-chat-message-rich-embed` + layout family).
- **7TV emote-set update notification card**
  (`.seventv-emote-set-update-message-container`) — Added / Removed /
  Renamed Emote system rows with 7TV logo, accent title, actor
  username, and per-change emote previews.
- **Vanilla chat-card preview** for clip / VOD / channel embeds
  (`[data-test-selector="chat-card-preview-container"]`) — separate
  from the 7TV rich-embed but visually paired.
- **Vanilla AutoMod families.** Self-notification (held / removed)
  styling on `.chat-line__message--special.--alert` with
  `[data-a-user="automod"]`. Moderator review row with
  `.text-fragment--moderated-highlight[role="mark"]` styling and the
  Permitir/Denegar action cluster preserved in the `:where()` block.
- **Vanilla deleted-message body** (`.chat-line__message--deleted-notice`)
  and **"Highlight My Message" body modifier**
  (`.chat-line__message-body--highlighted`).
- **Paid / animated message button cluster.** Twitch Power-Ups
  (Gigantify, Cosmic Abyss, Rainstorm, etc.) render with a looping
  `<video>` backdrop and an extra "Try Effect" / pause toggle alongside
  the reply icon. Cluster now stays visible at idle (no hover required)
  and each button gets a soft dark pill so the SVGs read against the
  animated background, pinned top-right of the message.
- **Badge label truncation.** `BADGE_LABEL_MAX = 3`; labels longer
  than 3 chars get sliced and tagged `data-gs-truncated="1"` with
  `cursor: help`. Original alt stays available via the `title`
  attribute. Net effect: rows with VIP / FOUNDER / TURBO go from
  15 to 9 visible characters in the pill column.
- **Reply-quote tooltip enhancer.** `tagReplyPreviewTooltip()` writes
  the full visible text into the `title` attribute on both renderers
  (vanilla `<p>` + 7TV `.seventv-reply-message-part`) so the
  `cursor: help` affordance actually reveals the missing tail when
  ellipsis truncates the preview.
- **`cursor: help`** on all three reply-quote selectors: 7TV
  `.seventv-reply-part`, vanilla aria-label-anchored
  `.chat-line__message-container > div:first-child`, and the legacy
  `[data-test-selector="reply-thread-line__reply-text"]` /
  `.chat-line__reply` / `.chat-line__reply-text` family.

### Changed
- **`processNativeRedeem` sibling walk fix.** When no direct child of
  the `[data-test-selector="user-notice-line"]` wrapper contains a
  `.chat-line__message` (current Twitch layout has it as a sibling
  instead — confirmed in `chat-example-06 / 08 / 11`), now falls back
  to the wrapper's siblings under their common parent and tags the
  matching ancestor with `gs-redeem-message`.
- **`processNativeRedeem` drops the verb.** "Canjeado:" / "Redeemed"
  is no longer appended to `.gs-redeem-left`; the card chrome already
  signals "this is a redemption" so the chip + cost are enough.
- **Notice classifier covers watch-streak / milestone / raid** —
  previously those rows fell through to the generic blue card because
  the regex only matched `subscrib | suscrit | gifted | regalad`.
  Now classified with the right palette automatically; raid uses a
  text-only regex (`/raid | incurs | incursión | raiders/i`) so it
  works without a captured DOM sample, with a defensive fallback to
  the base palette if the wording diverges.
- **Notice text source: last `<p>` (filtered).** Watch-streak rows
  ship 3+ paragraphs (the points reward `+` / amount paragraphs come
  before the achievement); picking the first `<p>` rendered the notice
  as just `"+"`, and flattening `wrapper.textContent` glued the
  chatter name to the reward number and pulled in the embedded user
  message. The new selector picks the LAST `<p>` while filtering out
  any paragraph inside an embedded `.chat-line__message` / `.fsLBGq` /
  `[data-a-target=chat-resubscription-message__custom-message]`
  subtree (so a reply quoted inside a resub doesn't become the
  notice text).
- **`PRIME` label renamed to `PRM`** — sits at 3 chars under
  `BADGE_LABEL_MAX`, so no truncation marker is added; the conventional
  consonants-only abbreviation reads cleaner than the truncation
  default `"PRI"` would.
- **Double-card regression on 7TV avoided.** `.gs-row.seventv-message`
  now resets padding / margin / border / background / box-shadow /
  min-height to zero — the visible card lives on the inner
  `.seventv-chat-message-background` (`gs-row-frame`), not the row
  root, so painting both sides double-stacked the chrome.
- **`.seventv-user-message` `margin-top` 5 → 0** as a follow-up to the
  gs-row reset (the 5 px nudge was compensating for outer-row padding
  that's now gone).
- **`.seventv-highlight` gets `padding-left: 1.1rem !important`** to
  override 7TV's Vue-scoped indent rule
  (`.seventv-highlight[data-v-…]`) without anchoring on the `data-v-*`
  hash that rotates per build.
- **First-Message banner redesign.** Was a full-width unreadable pink
  block; now a compact block-level chip above the message
  (`width: max-content`, `display: block !important`) with `!important`
  on display/sizing/colors so 7TV's Vue-scoped overrides can't
  reassert. Plus suppression of 7TV's `::after` that was painting a
  stray `"0"` from the `data-highlight-style` attribute.
- **`.seventv-user-message.has-highlight`** stripped of background and
  left rail — the colored banner chip above the message is now the
  only highlight cue (`background: none !important;
  border-left: none !important; padding: 4px 6px !important`).
- **Vanilla badge-wrapper pre-paint hide extended via `:has()`.** The
  parent `<div>` that holds an unprocessed badge button now gets
  hidden too, not just the inner button — eliminates the one-frame
  indented empty slot before the username during the
  `document_start → document_idle` window.
- **Vanilla badge wrappers forced inline-flex.** Twitch's hashed
  `.dvtAVE` wrapper can resolve to `display: block`, which pushes the
  pill onto its own row above the username. `.gs-row-badges > *` now
  forces inline-flex baseline alignment regardless of Twitch's class
  hash. Also collapses any wrapper that didn't end up holding a pill
  (custom channel badges, event badges) so empty flex items don't
  leak the parent's 3 px gap as a visible indent.
- **`.gs-row-badges:not(:has(.gs-badge))`** shared collapse: hides the
  badge-list parent (and zeros its margin / padding / gap) when no
  pill landed inside, on both renderers.
- **Vanilla badge-list `margin-right` dropped when pills exist.** Was
  compounding with the last pill's natural spacing; 7TV's
  `.seventv-chat-user` inline-flex container provides its own gap so
  it's left untouched.
- **Colon between username and message body removed on both
  renderers.** Vanilla relies on natural HTML whitespace collapse
  between siblings; 7TV gets `margin-left: 0.25em` on
  `.seventv-chat-message-body` since Vue templates ship without HTML
  whitespace to absorb. Row now reads as `username message` instead of
  `username : message`.
- **Notice card padding** 8 px 2 px → 8 px 6 px for more horizontal
  breathing room inside `.user-notice-line` / `.chat-line__usernotice`
  variants.
- **Reward name chip baseline** — `.reward-name` / `.gs-redeem-name`
  drop `vertical-align: middle` so the chip sits on the baseline along
  with the surrounding text.
- **`.chat-line__message-body--highlighted`** drops its own background
  and border; the redeem card chrome already paints the highlight so
  the body doesn't need a second tint pill on top.
- **`.gs-row-user` `margin-right` from 3 px → 1 px** (tighter
  username-to-colon spacing; partially superseded once the colon is
  removed but still relevant in the pre-paint window).

### Fixed
- **Inline-SVG emoji rendered empty.** 7TV reuses
  `.seventv-chat-emote` on `<svg class="seventv-chat-emote
  seventv-emoji">` for unicode emoji. The shared emote-sizing rule
  was `width: auto !important; height: auto !important` — SVG
  resolves `auto` to 0 (no intrinsic pixel size, only a viewBox), so
  any single-emoji message rendered as a 0×0 box. Narrowed the rule
  to `img.seventv-chat-emote` and added a parallel
  `svg.seventv-chat-emote` rule that caps width/height at the same
  `--gs-emote-max-h` value, plus the matching `[ratio="3"]/[ratio="4"]`
  oversize handling for SVGs.
- **Reply preview tooltip incomplete on vanilla.** The `<p>` carried
  `title="<original message>"` only — no `"Respuesta a @user: "` /
  `"Reply to @user: "` prefix. JS now writes the full visible
  preview text into the title.
- **Reply preview tooltip missing entirely on 7TV.**
  `.seventv-reply-message-part` had no `title` at all — when our
  ellipsis truncated long quotes, hovering revealed nothing. Same JS
  pass now fills it.

### Removed
- `STAR_SVG` constant in `badges.js` (replaced by the per-kind
  `NOTICE_ICONS` map and `buildNoticeIcon(kind)`).

## [0.2.2] — 2026-05-05

### Fixed
- Usernames in 7TV's reply-thread popup now soften to the same pastels
  as the main chat row (previously rendered with Twitch's harsh neon
  originals because the popup mounts outside our row scanner's path).
  Added a catch-all document-wide soften pass that runs on every
  observer batch, gated by `:not([data-gs-color="1"])` so repeat scans
  cost nothing.
- 7TV's hover/focus-within gray background + border-radius on the
  inner `.seventv-user-message` is now stripped — it was layering on
  top of our own row hover wash and reading as visual noise.

### Changed
- `.seventv-user-message` gains `margin-top: 5px` at idle so the
  message block doesn't butt up against the row's top edge.

## [0.2.1] — 2026-05-05

### Changed
- `manifest.json` `browser_specific_settings.gecko.id`:
  `ghostsplit-chat-theme@ghostsplit` → `twitch-chat-theme@ghostsplit.gg`.
  Mozilla AMO permanently reserves an add-on ID once it has been used,
  even after the listing is deleted, so the previously-used ID was no
  longer available. Firefox treats the new ID as a separate add-on; users
  who had a previous build sideloaded will need to remove it before
  installing the new one. No code or behaviour changes vs 0.2.0.

## [0.2.0] — 2026-05-05

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
