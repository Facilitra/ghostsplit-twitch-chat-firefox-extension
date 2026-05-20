/* =============================================================================
   GhostSplit Chat Theme — badge-pill content script
   =============================================================================

   Replaces Twitch's image badges (and 7TV's mirrored badges) next to each
   username with GhostSplit-style TEXT pills (SUB, VIP, MOD, FOUNDER, etc.).

   Why JS: CSS can't read an attribute value and synthesize a string label
   from it. The user explicitly authorized this JS pass to match the
   GhostSplit badge rendering.

   What we do:
     1. Maintain a map of `alt`-text patterns → GhostSplit pill classes/labels.
        Twitch's alt is locale-dependent (Spanish here), so each entry has
        both Spanish and English regexes.
     2. For every message that appears in chat (initial render + stream-in),
        find the badge images and:
          a) if the alt matches a known role → insert a text pill before the
             badge and hide the original image.
          b) otherwise → hide the original image (drops custom channel sub
             badges, event badges, charity badges, etc., to mirror
             GhostSplit's compact pill-only look).
     3. Use a MutationObserver scoped to the chat root, and mark each message
        with `data-gs-pills` so we never reprocess one.
     4. Soften per-user neon username colors via the GhostSplit
        `softenChatColor` algorithm (function `soften` below). The softened
        value is stored in a `--gs-color` CSS variable so it survives the
        framework's later inline-style re-renders.
     5. Rewrite native sub / resub / gift notice rows into the GhostSplit
        flat notice card (function `processNativeSubNotice`).
     6. Detect light theme (Twitch's `tw-root--theme-light` class first,
        body-background luminance fallback) and toggle `.gs-light` on
        <html>. The CSS light-theme override block is keyed on
        `:is(.tw-root--theme-light, .gs-light) .chat-shell`, so the JS
        detection hands the CSS a class it can rely on regardless of
        what Twitch renames their own theme class to.

   Structural classes added:
     .gs-badge                              base pill
     .gs-badge-broadcaster                  red
     .gs-badge-streamer                     white
     .gs-badge-moderator                    green
     .gs-badge-vip                          purple
     .gs-badge-subscriber                   accent
     .gs-badge-founder                      gold
     .gs-badge-staff                        blue
     .gs-badge-admin                        orange
     .gs-badge-global_mod                   cyan
     .gs-badge-turbo                        violet
     .gs-badge-premium                      sky
     .gs-badge-bits                         cyan-ish

   The pill styling lives in twitch-chat.css.
   ============================================================================ */

(() => {
  "use strict";

  // Pills longer than this many characters are visually truncated; the full
  // label still exists in the DOM via the `title` attribute (which already
  // carries Twitch's original localized alt text — "Fundador", "Suscripción
  // durante 9 meses", etc.), so hovering reveals the real value. A row with
  // VIP / FOUNDER / TURBO is otherwise wider than the username itself.
  const BADGE_LABEL_MAX = 3;

  // ---- 1. alt → pill mapping ------------------------------------------------
  // Order matters: more specific matches first. Each entry has Spanish AND
  // English patterns since Twitch localizes alt text per user locale.

  /** @type {Array<{match: RegExp, cls: string, label: string}>} */
  const BADGE_MAP = [
    // broadcaster (channel owner) — alt: "Difusor" / "Broadcaster"
    { match: /^(difusor|broadcaster)$/i, cls: "gs-badge-broadcaster", label: "HOST" },

    // moderator
    { match: /^(moderador|moderator)$/i, cls: "gs-badge-moderator", label: "MOD" },

    // global mod
    { match: /^(moderador global|global mod)$/i, cls: "gs-badge-global_mod", label: "GMOD" },

    // VIP
    { match: /^vip$/i, cls: "gs-badge-vip", label: "VIP" },

    // founder
    { match: /^(fundador|founder)$/i, cls: "gs-badge-founder", label: "FOUNDER" },

    // staff
    { match: /^(staff|personal de twitch)$/i, cls: "gs-badge-staff", label: "STAFF" },

    // admin
    { match: /^(admin|administrador|administrator)$/i, cls: "gs-badge-admin", label: "ADMIN" },

    // turbo
    { match: /^turbo$/i, cls: "gs-badge-turbo", label: "TURBO" },

    // prime / premium gaming — labeled "PRM" rather than the truncation
    // default "PRI" (which would be misread as a partial word). PRM is
    // the conventional consonants-only abbreviation. At 3 chars it sits
    // under BADGE_LABEL_MAX, so no truncation marker is added; the
    // browser tooltip still shows the original Twitch alt on hover.
    { match: /^(prime|prime gaming|premium)$/i, cls: "gs-badge-premium", label: "PRM" },

    // cheer / bits — alt: "cheer 100", "cheer 1000", "cheer 5000", etc.
    { match: /^cheer\s*\d+/i, cls: "gs-badge-bits", label: "BITS" },

    // subscriber — must be LAST in the sub-related group. Alt and
    // aria-label examples we've observed in the wild:
    //   "Suscriptor", "Suscriptor durante 9 meses",
    //   "Suscripción durante 7 mes(es) (emblema de 6 meses)" (the
    //     unlocalized account / Spanish-default variant Twitch ships
    //     when a user is not logged in — uses the noun "Suscripción"
    //     instead of the agent noun "Suscriptor"),
    //   "Subscriber", "Subscriber for 1 year",
    //   "1-Year Subscriber", "6-Month Subscriber" (keyword NOT at the
    //     start of the string),
    //   "Insignia de suscriptor durante 9 meses".
    // The keyword can appear anywhere, so we don't anchor on `^` here —
    // `\b` on either side gives us a word match without false-positives
    // like "subscribers". The earlier role-specific entries above
    // (broadcaster, mod, vip, founder, staff, …) take priority because
    // BADGE_MAP is iterated in order.
    {
      match: /\b(suscripci[oó]n|suscriptor|subscriber|sub)\b/i,
      cls: "gs-badge-subscriber",
      label: "SUB",
    },
  ];

  // ---- 2. core: convert one image → pill (or drop) --------------------------

  /**
   * Build a pill element for the given alt text, or return null if the alt
   * doesn't match any known structural role (caller should hide the image).
   * @param {string} alt
   * @returns {HTMLElement | null}
   */
  function buildPill(alt) {
    const text = (alt || "").trim();
    if (!text) return null;

    const match = BADGE_MAP.find((b) => b.match.test(text));
    if (!match) return null;

    const pill = document.createElement("span");
    pill.className = `gs-badge ${match.cls}`;
    const truncated = match.label.length > BADGE_LABEL_MAX;
    pill.textContent = truncated
      ? match.label.slice(0, BADGE_LABEL_MAX)
      : match.label;
    // Hover always reveals Twitch's original localized alt for context
    // ("Fundador" / "Suscripción durante 9 meses"), regardless of whether we
    // truncated. `data-gs-truncated` is the CSS hook for the `cursor: help`
    // affordance applied only on shortened pills.
    pill.title = text;
    pill.setAttribute("aria-label", text);
    pill.dataset.gsBadge = match.label;
    if (truncated) pill.dataset.gsTruncated = "1";
    return pill;
  }

  /**
   * Replace one badge IMG (native Twitch or 7TV) with a pill, or hide it.
   * Idempotent: marks the parent badge element so we don't touch it twice.
   * @param {HTMLImageElement} img
   */
  function processBadgeImg(img) {
    // Find the wrapping badge element (button.chat-badge for native,
    // .seventv-chat-badge for 7TV).
    const wrapper =
      img.closest('button[data-a-target="chat-badge"]') ||
      img.closest(".seventv-chat-badge") ||
      img.parentElement;

    if (!wrapper || wrapper.dataset.gsProcessed === "1") return;
    wrapper.dataset.gsProcessed = "1";

    const pill = buildPill(img.getAttribute("alt"));

    if (pill) {
      // Insert pill before the wrapper, then hide the wrapper. We don't
      // detach the wrapper outright in case Twitch's React layer re-checks
      // its existence.
      wrapper.parentElement?.insertBefore(pill, wrapper);
      wrapper.style.display = "none";
    } else {
      // No matching role — drop the original badge so the row stays clean.
      wrapper.style.display = "none";
    }
  }

  // ---- 2b. username color softening (ported from src/utils/colorHelpers.ts)

  /**
   * Parse `rgb(r, g, b)` or `#rrggbb` to {r,g,b}. Returns null if neither.
   * @param {string} input
   * @returns {{r:number,g:number,b:number} | null}
   */
  function parseColor(input) {
    if (!input) return null;
    const trimmed = input.trim();
    const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(trimmed);
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1], 10),
        g: parseInt(rgbMatch[2], 10),
        b: parseInt(rgbMatch[3], 10),
      };
    }
    const hexMatch = /^#?([0-9a-f]{6})$/i.exec(trimmed);
    if (hexMatch) {
      const v = hexMatch[1];
      return {
        r: parseInt(v.slice(0, 2), 16),
        g: parseInt(v.slice(2, 4), 16),
        b: parseInt(v.slice(4, 6), 16),
      };
    }
    return null;
  }

  /**
   * Soften a Twitch username color the same way GhostSplit's
   * src/utils/colorHelpers.ts → softenChatColor() does.
   *
   * - Mix the input color toward a light base rgb(220,220,235) at weight
   *   0.78 (i.e. 0.65 × 1.2, the dark-mode coefficient from the source).
   * - If the result's perceived luminance (Rec. 601) exceeds 0.8, re-mix
   *   the original color toward a darker base rgb(80,80,100) at 0.8 so
   *   neon-bright names don't read as white-on-white.
   *
   * The output is tuned for a dark chat surface. On light theme the CSS
   * override block redirects `--gs-color` to a high-contrast slate so this
   * function's output isn't applied — see the `[data-gs-color]` rule under
   * `:is(.tw-root--theme-light, .gs-light) .chat-shell`.
   *
   * @param {{r:number,g:number,b:number}} c
   * @returns {string} `rgb(r, g, b)`
   */
  function soften(c) {
    const w = 0.78;
    const base = { r: 220, g: 220, b: 235 };
    const nr = Math.round(c.r * w + base.r * (1 - w));
    const ng = Math.round(c.g * w + base.g * (1 - w));
    const nb = Math.round(c.b * w + base.b * (1 - w));
    const luminance = (nr * 299 + ng * 587 + nb * 114) / 1000 / 255;
    if (luminance > 0.8) {
      const dark = { r: 80, g: 80, b: 100 };
      const dw = 0.8;
      return (
        "rgb(" +
        Math.round(c.r * dw + dark.r * (1 - dw)) + ", " +
        Math.round(c.g * dw + dark.g * (1 - dw)) + ", " +
        Math.round(c.b * dw + dark.b * (1 - dw)) + ")"
      );
    }
    return `rgb(${nr}, ${ng}, ${nb})`;
  }

  /**
   * For each username node in the row, store the softened color in a CSS
   * custom property (`--gs-color`). The CSS rule
   *   [data-gs-color="1"] { color: var(--gs-color) !important }
   * then wins over any inline `style.color` that 7TV / Twitch might write
   * back later in their re-render cycles. Without this, the framework's
   * subsequent `style.color = "rgb(...)"` assignments would overwrite a
   * direct `node.style.color = soft` and revert us to the harsh original.
   *
   * @param {Element} row
   */
  function softenUsernames(root) {
    // Native Twitch:  .chat-author__display-name  (inline style on the span)
    // 7TV:             .seventv-chat-user           (inline style on a div wrapper)
    // The `:not([data-gs-color="1"])` filter makes this idempotent and
    // keeps repeat scans cheap (browsers index attribute selectors), so
    // the same call is fine to run per-row OR document-wide — see
    // `softenUsernamesEverywhere` below for the catch-all pass that
    // picks up usernames in 7TV thread popups, hover preview cards, and
    // any other surface our row-based scanner doesn't visit.
    const targets = root.querySelectorAll(
      '.chat-author__display-name:not([data-gs-color="1"]), .seventv-chat-user:not([data-gs-color="1"])'
    );
    targets.forEach((el) => {
      const node = /** @type {HTMLElement} */ (el);
      // Read whichever color is currently effective: prefer the inline
      // attribute, fall back to computed style for elements where Twitch
      // sets the color via class.
      const raw =
        node.style.color || getComputedStyle(node).color || "";
      const parsed = parseColor(raw);
      if (!parsed) return;
      node.style.setProperty("--gs-color", soften(parsed));
      node.dataset.gsColor = "1";
    });
  }

  /**
   * If a 7TV `.seventv-chat-user-badge-list` ended up with NO `.gs-badge`
   * pills inserted (every badge in it mapped to nothing — e.g. only
   * custom channel sub badges or event badges), hide the wrapper itself
   * so its `margin-right` doesn't leave an empty gap before the username.
   * @param {Element} row
   */
  function collapseEmptyBadgeLists(row) {
    row.querySelectorAll(".seventv-chat-user-badge-list").forEach((list) => {
      const el = /** @type {HTMLElement} */ (list);
      if (!el.querySelector(".gs-badge")) {
        el.style.display = "none";
      } else {
        // Re-show in case a previous pass collapsed it and a new pill
        // appeared since (defensive — shouldn't happen with our
        // idempotency guards, but cheap).
        el.style.display = "";
      }
    });
  }

  /**
   * Native channel-points redeem rows ship as:
   *
   *   <wrapper>                             (the parent of user-notice-line)
   *     <div style="--color-border-quote">  (the colored left rail — sibling)
   *     <div data-test-selector=user-notice-line>
   *       <div>                             (header section)
   *         <div .channel-points-reward-line>
   *           "Canjeado: Hablame con voz"   (text node)
   *           <div .channel-points-reward-line__icon>
   *           "5000"                        (text node)
   *       <div>                             (message section)
   *         <div .chat-line__message>       (the user's actual chat msg)
   *
   * 7TV ships the same data as a totally different shape:
   *
   *   <span .seventv-reward-message-container.seventv-highlight>
   *     <div .reward-part>
   *       <div .reward-left>
   *         <span .reward-username>RetroDannyCR</span> redeemed
   *         <span .reward-name bold>Hablame con voz</span>
   *       </div>
   *       <span .reward-cost bold><svg/><span>5000</span></span>
   *     </div>
   *     <div .message-part>
   *       <span .seventv-user-message>...</span>
   *     </div>
   *   </span>
   *
   * To use ONE set of CSS rules for both renderers, this function
   * rewrites the native DOM into the 7TV shape: it adds the
   * seventv-reward-message-container + seventv-highlight classes to the
   * outer wrapper, replaces the header line content with a .reward-part
   * subtree, and tags the message section with .message-part. After
   * this pass, every existing .chat-shell .seventv-reward-* rule
   * applies to the native row too, so we can delete the parallel
   * .gs-reward-* CSS family entirely.
   *
   * Idempotent via data-gs-redeem on the header line.
   *
   * @param {Element} row
   */
  function processNativeRedeem(row) {
    const wrapper = row.closest('[data-test-selector="user-notice-line"]');
    if (!wrapper) return;
    const iconHolder = wrapper.querySelector(".channel-points-reward-line__icon");
    if (!iconHolder) return;

    const headerLine = /** @type {HTMLElement} */ (iconHolder.parentElement);
    if (!headerLine || headerLine.dataset.gsRedeem === "1") return;
    headerLine.dataset.gsRedeem = "1";

    // Read the [pre-text, icon, post-text] tuple from the header line.
    /** @type {Text | null} */ let preTextNode = null;
    /** @type {Text | null} */ let postTextNode = null;
    let seenIcon = false;
    for (const node of Array.from(headerLine.childNodes)) {
      if (node === iconHolder) {
        seenIcon = true;
        continue;
      }
      if (node.nodeType !== Node.TEXT_NODE) continue;
      if (!seenIcon) preTextNode = /** @type {Text} */ (node);
      else postTextNode = /** @type {Text} */ (node);
    }

    // Split the leading prefix at the first ":" (Spanish: "Canjeado:
    // <name>") or at the first space (English: "Redeemed <name>"). The
    // prefix becomes inline body text, the name becomes the chip.
    const raw = (preTextNode?.nodeValue || "").trim();
    const colonIdx = raw.indexOf(":");
    const splitAt = colonIdx >= 0 ? colonIdx + 1 : raw.indexOf(" ");
    const prefixText = splitAt > 0 ? raw.slice(0, splitAt) : raw;
    const nameText = splitAt > 0 ? raw.slice(splitAt).trim() : "";
    const costText = (postTextNode?.nodeValue || "").trim();

    // Build the redeem-part subtree using OUR namespace (`gs-*`). The
    // CSS pairs these selectors with the equivalent 7TV ones so a
    // single rule set styles both renderers — without us pretending to
    // BE 7TV by stamping `.seventv-*` classes on synthesized DOM.
    const rewardPart = document.createElement("div");
    rewardPart.className = "gs-redeem-part";

    const rewardLeft = document.createElement("div");
    rewardLeft.className = "gs-redeem-left";
    // `prefixText` (the "Canjeado:" / "Redeemed" verb) is intentionally
    // dropped — the redeem card chrome already signals "this is a
    // redemption" via its border + accent palette, so the verb is
    // redundant noise. Only the name chip + cost remain.
    if (nameText) {
      const nameSpan = document.createElement("span");
      nameSpan.className = "gs-redeem-name";
      nameSpan.textContent = nameText;
      rewardLeft.appendChild(nameSpan);
    }
    rewardPart.appendChild(rewardLeft);

    if (costText) {
      const rewardCost = document.createElement("span");
      rewardCost.className = "gs-redeem-cost";
      // Move the original icon holder into the cost span — the icon
      // <img> stays intact (Twitch CDN), only its parent changes. The
      // existing CSS sizes the img via .channel-points-reward-line__icon.
      rewardCost.appendChild(iconHolder);
      const costNum = document.createElement("span");
      costNum.textContent = costText;
      rewardCost.appendChild(costNum);
      rewardPart.appendChild(rewardCost);
    }

    // Replace the header line's contents with the rebuilt subtree.
    while (headerLine.firstChild) headerLine.removeChild(headerLine.firstChild);
    headerLine.appendChild(rewardPart);

    // Tag the OUTER wrapper as a redeem card. Pairs with the 7TV
    // .seventv-reward-message-container.seventv-highlight selector in
    // CSS via comma-grouped rules.
    const cardWrapper = wrapper.parentElement;
    if (cardWrapper && !cardWrapper.classList.contains("gs-redeem-card")) {
      cardWrapper.classList.add("gs-redeem-card");
    }

    // Tag the user-message section (the wrapper that contains the
    // actual chat-line__message). In current Twitch builds the message
    // can land in either of two places:
    //   (a) as a descendant of one of `wrapper`'s direct children
    //       (older layout — what processRow's original walk assumed), or
    //   (b) as a sibling of `wrapper` under their common parent
    //       (newer layout — confirmed in chat-example-06 / 08 / 11).
    // Try (a) first; if no child contains a chat-line__message, fall
    // back to (b) and tag the sibling.
    let tagged = false;
    for (const child of Array.from(wrapper.children)) {
      if (child.querySelector(":scope .chat-line__message")) {
        child.classList.add("gs-redeem-message");
        tagged = true;
        break;
      }
    }
    if (!tagged && cardWrapper) {
      for (const sib of Array.from(cardWrapper.children)) {
        if (sib === wrapper) continue;
        if (
          sib.matches?.(".chat-line__message") ||
          sib.querySelector?.(".chat-line__message")
        ) {
          sib.classList.add("gs-redeem-message");
          break;
        }
      }
    }
  }

  /**
   * Inline-SVG icon set for notice cards. One per `data-gs-notice-kind`.
   * Content scripts can't fetch site-relative assets without a
   * web_accessible_resources declaration, so we inline the paths and
   * import them with DOMParser (no innerHTML).
   *
   * Glyphs match the GhostSplit chat-client originals where possible:
   *   sub / gift → star (resub, gift, prime-resub all share)
   *   raid       → megaphone (matches Twitch's announcement glyph; raids
   *                are still "shouts to a chat" semantically)
   *   milestone  → flame (watch-streak / viewer-milestone)
   *   bits       → lightning (cheer notices, when they land here)
   *   announce   → speaker (broadcaster announcement — when it lands in
   *                user-notice-line; the .announcement-line path uses
   *                Twitch's own icon, untouched)
   *   ratelimit  → exclamation triangle
   */
  /** @type {Record<string, string>} */
  const NOTICE_ICONS = {
    sub: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2 L14.85 8.6 L22 9.3 L16.5 14 L18.1 21 L12 17.3 L5.9 21 L7.5 14 L2 9.3 L9.15 8.6 Z"/></svg>`,
    gift: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 7h-3.2a3 3 0 0 0-4.8-3 3 3 0 0 0-4.8 3H4v6h1v9h14v-9h1V7zm-7-2a1 1 0 1 1 1 1h-1V5zm-3 1h-1a1 1 0 1 1 1-1v1zm9 14h-5v-7h5v7zm-7 0H7v-7h5v7zm7-9H6V9h13v2z"/></svg>`,
    raid: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 14l7 4V2l-7 4H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2v4h2v-4h3zm5-8.27v12.54L11.46 16H4V8h7.46L16 5.73z"/></svg>`,
    milestone: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13 2.05c0 3.95 2 5.13 2 8.45 0 1.83-1 3.5-3 3.5s-3-1.67-3-3.5C9 8 6 7 6 11.5c0 5 4 9.5 7 9.5s7-3 7-9c0-7-7-9.95-7-9.95z"/></svg>`,
    bits: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13 2L4.5 14h7l-1 8L19 10h-7l1-8z"/></svg>`,
    announce: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 14l7 4V2l-7 4H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2v4h2v-4h3z"/></svg>`,
    ratelimit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2 1 21h22L12 2zm0 4.83 7.53 12.67H4.47L12 6.83zM11 10h2v5h-2v-5zm0 6h2v2h-2v-2z"/></svg>`,
  };

  /**
   * Classify the textContent of a user-notice-line wrapper into one of
   * the supported notice kinds. Returns null if no keyword matches —
   * caller should leave the row alone (it'll fall through to generic
   * row styling).
   *
   * Order matters: more specific patterns first. E.g. "continuing the
   * gift" must match before "gifted" lest a continued-gift be misread
   * as a single gift.
   *
   * Locale: both Spanish (Twitch ES) and English (Twitch EN) keywords
   * are covered for every kind. Adding a third locale means adding the
   * localized keyword to each kind's regex, not adding a kind.
   *
   * @param {string} text
   * @returns {"sub"|"gift"|"raid"|"milestone"|"bits"|"announce"|"ratelimit"|null}
   */
  function classifyNoticeText(text) {
    if (!text) return null;
    // continued / chained gift — must come before plain gift
    if (/\b(continued the gift|continúa el regalo|continuó el regalo)\b/i.test(text)) return "gift";
    // gift (single or community)
    if (/\b(gifted|regalad)/i.test(text)) return "gift";
    // raid / incursión
    if (/\b(raid(ing|ers|)?|incurs(ion|ión)|incursionar)\b/i.test(text)) return "raid";
    // watch-streak / viewer milestone
    if (/\b(watch streak|streak achievement|racha de visualizaciones|racha de \d+|streams seguidos)\b/i.test(text)) return "milestone";
    // big cheers as system notice (not the badge — the cheer-effect row)
    if (/\b(cheered|porras de bits|ha enviado \d+ bits)\b/i.test(text)) return "bits";
    // broadcaster announcement — when it lands here instead of
    // .announcement-line (some channels / older builds)
    if (/\b(announcement|anuncio del difusor)\b/i.test(text)) return "announce";
    // rate-limit / slow-mode notice
    if (/\b(slow mode|modo lento|mensajes demasiado rápido|enviando mensajes demasiado)\b/i.test(text)) return "ratelimit";
    // sub / resub (must be LAST — keyword "subscrib" is the most generic)
    if (/\b(subscrib|suscrit|suscripci)/i.test(text)) return "sub";
    return null;
  }

  /**
   * Build an inline SVG node for the given notice kind. Falls back to
   * the sub-kind star if the kind is unknown.
   * @param {string} kind
   * @returns {SVGElement | null}
   */
  function buildNoticeIcon(kind) {
    const src = NOTICE_ICONS[kind] || NOTICE_ICONS.sub;
    const svgDoc = new DOMParser().parseFromString(src, "image/svg+xml");
    const svg = svgDoc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg") return null;
    const imported = /** @type {SVGElement} */ (document.importNode(svg, true));
    imported.setAttribute("class", "gs-notice-icon");
    return imported;
  }

  /**
   * Native sub / resub / Prime / gift / raid / milestone / bits /
   * announce / ratelimit notices all land inside a user-notice-line
   * wrapper with a chunky multi-element layout (icon column + paragraph
   * with chatter-name + emphasized spans + optional inline link). The
   * original GhostSplit chat client renders all of them as flat
   * single-line notices on a kind-specific palette:
   *
   *   <div class="chat-message notice chat-message-system chat-message-system-{kind}">
   *     <span class="chat-notice-wrap">
   *       <img class="chat-notice-icon" src=".../{kind}.svg" />
   *       <span class="chat-notice-text">{flattened text}</span>
   *     </span>
   *   </div>
   *
   * That's what this function builds. The kind is classified by the
   * paragraph's textContent (see classifyNoticeText) and written onto
   * the outer wrapper as `data-gs-notice-kind` — CSS reads that
   * attribute to switch palette per kind. We use `gs-notice-*` class
   * names instead of GhostSplit's `chat-notice-*` to avoid colliding
   * with anything Twitch ships.
   *
   * Detection: inside a user-notice-line, NOT a channel-points redeem
   * (no .channel-points-reward-line__icon), and the text content
   * matches one of the kinds in classifyNoticeText().
   *
   * Idempotent via `data-gs-notice="1"` on the wrapper.
   *
   * @param {Element} row
   */
  function processNativeNotice(row) {
    const wrapper = row.closest('[data-test-selector="user-notice-line"]');
    if (!wrapper) return;
    const w = /** @type {HTMLElement} */ (wrapper);
    if (w.dataset.gsNotice === "1") return;
    if (wrapper.querySelector(".channel-points-reward-line__icon")) return;

    const text = wrapper.textContent || "";
    const kind = classifyNoticeText(text);
    if (!kind) return;

    w.dataset.gsNotice = "1";
    w.dataset.gsNoticeKind = kind;

    // Pick the LAST `<p>` in the wrapper as the notice text source —
    // but EXCLUDE paragraphs that live inside an embedded user message.
    //
    // First-paragraph (the original approach) breaks watch-streak rows
    // because they ship multiple paragraphs in the header column:
    //   <p>+</p>                 ← points reward indicator
    //   <p>450</p>               ← points reward amount
    //   <p>¡Racha …! ¡X ha logrado …!</p>   ← the actual achievement
    // The first <p> renders the notice as just "+".
    //
    // wrapper.textContent (the previous "flatten everything" approach)
    // ALSO breaks because (a) it concatenates with no separators so the
    // chatter-name span fuses with the reward number ("RioterBlack+450"),
    // and (b) it sweeps in the embedded user-typed message that ships
    // alongside the streak (in a `.fsLBGq > .chat-line--inline.chat-line__message`
    // sibling), producing tails like "…streams! SUB <user>: <typed message>".
    //
    // Last-paragraph dodges those issues, BUT a resub or watch-streak
    // can ship an embedded message that IS a reply — replies carry
    // their OWN `<p title="…">Respuesta a @x: original message</p>`
    // inside the chat-line__message, which would become the last <p>
    // in the wrapper and we'd quote the reply preview instead of the
    // notice text. Filter those out by walking up from each candidate
    // and dropping anything that sits inside an embedded message
    // subtree (`.chat-line__message`, `.fsLBGq`,
    // `[data-a-target=chat-resubscription-message__custom-message]`).
    const paragraphs = Array.from(wrapper.querySelectorAll("p")).filter(
      (p) =>
        !p.closest(
          ".chat-line__message, .fsLBGq, [data-a-target='chat-resubscription-message__custom-message']"
        )
    );
    const lastP = paragraphs[paragraphs.length - 1];
    if (!lastP) return;
    const noticeText = (lastP.textContent || "").trim().replace(/\s+/g, " ");
    if (!noticeText) return;

    const wrap = document.createElement("span");
    wrap.className = "gs-notice-wrap";

    const icon = buildNoticeIcon(kind);
    if (icon) wrap.appendChild(icon);

    const textSpan = document.createElement("span");
    textSpan.className = "gs-notice-text";
    textSpan.textContent = noticeText;
    wrap.appendChild(textSpan);

    // Replace the user-notice-line content with our flat notice.
    while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
    wrapper.appendChild(wrap);

    // Tag the outer wrapper so the notice-card CSS picks it up. The
    // `gs-notice-card-sub` legacy class stays only for the `sub` kind
    // so any external selectors targeting it keep working; the modern
    // path is the `[data-gs-notice-kind]` attribute on the same node.
    const cardWrapper = wrapper.parentElement;
    if (cardWrapper) {
      const cw = /** @type {HTMLElement} */ (cardWrapper);
      cw.classList.add("gs-notice-card");
      cw.dataset.gsNoticeKind = kind;
      if (kind === "sub") cw.classList.add("gs-notice-card-sub");
    }
  }

  /**
   * Sub / watch-streak / raid notice rows do NOT contain a
   * .chat-line__message, so processRow never reaches them. Scan the
   * document for user-notice-line wrappers directly and run the
   * notice-specific transformers. Idempotent (each transformer guards
   * with its own data-* marker).
   */
  function processNativeNotices() {
    document
      .querySelectorAll('[data-test-selector="user-notice-line"]')
      .forEach((wrapper) => {
        processNativeRedeem(wrapper);
        processNativeNotice(wrapper);
      });
  }

  /**
   * Stamp shared `gs-row-*` classes on the structural parts of a chat
   * row so a single CSS selector set can style both vanilla Twitch
   * (`.chat-line__message …`) and 7TV (`.seventv-message …`) without
   * paired rules. The native selectors stay as fallbacks in the CSS
   * (they catch the frame between `document_start` CSS injection and
   * `document_idle` JS boot), but every new rule should target
   * `.gs-row-*`.
   *
   * Mapping (vanilla → 7TV → shared class):
   *   .chat-line__message                  | .seventv-message
   *     ↳ gs-row
   *   .chat-line__message-container        | .seventv-chat-message-background
   *     ↳ gs-row-frame
   *   .chat-line__timestamp                | .seventv-chat-message-timestamp
   *     ↳ gs-row-time
   *   .chat-line__username-container       | .seventv-chat-user
   *     ↳ gs-row-user
   *   (badge list <span>)                  | .seventv-chat-user-badge-list
   *     ↳ gs-row-badges
   *   .chat-author__display-name           | .seventv-chat-user-username (inner)
   *     ↳ gs-row-name
   *   [data-a-target=chat-line-message-body] | .seventv-chat-message-body
   *     ↳ gs-row-body
   *   .text-fragment                       | .text-token
   *     ↳ gs-row-text
   *   .mention-fragment                    | .mention-token
   *     ↳ gs-row-mention
   *   [data-a-target=emote-name]           | .seventv-emote-box
   *     ↳ gs-row-emote (+ gs-row-emote-big if ratio≥3)
   *   a.link-fragment                      | a.link-part
   *     ↳ gs-row-link
   *
   * Idempotent — every classList.add is a no-op if already present.
   * Selectors prefer stable Twitch data-attributes and 7TV semantic
   * classes; we never rely on Twitch's hashed `Layout-sc-*` /
   * `AoXTY` / `dtoOxd` classes (they rotate per build).
   *
   * @param {Element} row
   */
  function tagRowParts(row) {
    const isSeventv = row.matches(".seventv-message");
    row.classList.add("gs-row");

    // Frame — the inner wrapper we style as the visible card
    const frame = isSeventv
      ? row.querySelector(".seventv-chat-message-background")
      : row.querySelector(".chat-line__message-container");
    frame?.classList.add("gs-row-frame");

    // Timestamp
    const time = isSeventv
      ? row.querySelector(".seventv-chat-message-timestamp")
      : row.querySelector('[data-a-target="chat-timestamp"]');
    time?.classList.add("gs-row-time");

    // Username container (the colored block with badges + name)
    const userBlock = isSeventv
      ? row.querySelector(".seventv-chat-user")
      : row.querySelector(".chat-line__username-container");
    userBlock?.classList.add("gs-row-user");

    // Badge list parent
    if (isSeventv) {
      row.querySelector(".seventv-chat-user-badge-list")?.classList.add("gs-row-badges");
    } else {
      // Vanilla: badges live in the first <span> inside the username
      // container — the one that holds the badge wrapper <div>s.
      const badgeListSpan = userBlock?.querySelector(":scope > span:not(.chat-line__username)");
      badgeListSpan?.classList.add("gs-row-badges");
    }

    // Display name leaf
    const name = isSeventv
      ? row.querySelector(".seventv-chat-user-username")
      : row.querySelector('[data-a-target="chat-message-username"]');
    name?.classList.add("gs-row-name");

    // Body
    const body = isSeventv
      ? row.querySelector(".seventv-chat-message-body")
      : row.querySelector('[data-a-target="chat-line-message-body"]');
    body?.classList.add("gs-row-body");

    // Body tokens — text / mention / link / emote
    if (body) {
      body.querySelectorAll(isSeventv ? ".text-token" : ".text-fragment")
        .forEach((el) => el.classList.add("gs-row-text"));
      body.querySelectorAll(isSeventv ? ".mention-token" : ".mention-fragment")
        .forEach((el) => el.classList.add("gs-row-mention"));
      body.querySelectorAll(isSeventv ? "a.link-part" : "a.link-fragment")
        .forEach((el) => el.classList.add("gs-row-link"));
      if (isSeventv) {
        body.querySelectorAll(".seventv-emote-box").forEach((el) => {
          el.classList.add("gs-row-emote");
          const r = el.getAttribute("ratio");
          if (r === "3" || r === "4") el.classList.add("gs-row-emote-big");
        });
      } else {
        body.querySelectorAll('[data-a-target="emote-name"]')
          .forEach((el) => el.classList.add("gs-row-emote"));
      }
    }
  }

  /**
   * Both renderers truncate the inline reply-quote preview to a single
   * line via `text-overflow: ellipsis` (twitch-chat.css), so when the
   * original message is long the visible text gets cut off mid-string.
   * We've also given the preview a `cursor: help` affordance to signal
   * a tooltip is available — but the tooltips Twitch / 7TV ship are
   * either missing (7TV's `.seventv-reply-message-part` has no `title`)
   * or partial (vanilla's `<p title="…">` carries only the original
   * quoted message, NOT the `"Respuesta a @user: "` prefix). So we
   * promote the full visible text of the preview into the `title`
   * attribute on the element the user actually hovers, on both
   * renderers, idempotently.
   *
   * @param {Element} row
   */
  function tagReplyPreviewTooltip(row) {
    // 7TV: a single text-bearing div, no title by default.
    const seventvPart = row.querySelector(".seventv-reply-message-part");
    if (seventvPart instanceof HTMLElement && !seventvPart.dataset.gsReplyTip) {
      const full = (seventvPart.textContent || "").trim().replace(/\s+/g, " ");
      if (full) {
        seventvPart.title = full;
        seventvPart.dataset.gsReplyTip = "1";
      }
    }
    // Vanilla: gate on the row's aria-label since the inner `.iWlGez`
    // class is a CSS-in-JS hash. The reply-preview <p> lives at
    // `.chat-line__message-container > div:first-child p` for reply
    // rows. Replace its existing title (only the original message)
    // with the full inline text so the prefix + @user are included.
    const ariaLabel = row.getAttribute("aria-label") || "";
    if (/^(reply to|respuesta a)\b/i.test(ariaLabel)) {
      const previewP = row.querySelector(
        '.chat-line__message-container > div:first-child p'
      );
      if (previewP instanceof HTMLElement && !previewP.dataset.gsReplyTip) {
        const full = (previewP.textContent || "").trim().replace(/\s+/g, " ");
        if (full) {
          previewP.title = full;
          previewP.dataset.gsReplyTip = "1";
        }
      }
    }
  }

  /**
   * Process all badges + soften usernames inside one message row.
   * Idempotent.
   * @param {Element} row
   */
  function processRow(row) {
    if (row.dataset.gsPills === "1") return;
    row.dataset.gsPills = "1";

    // Tag the structural parts with shared `gs-row-*` classes so CSS
    // can target one selector set for both vanilla and 7TV DOMs.
    tagRowParts(row);

    // Badges
    const badges = row.querySelectorAll(
      'button[data-a-target="chat-badge"] img, .seventv-chat-badge img'
    );
    badges.forEach((img) => processBadgeImg(/** @type {HTMLImageElement} */ (img)));

    // Hide 7TV badge wrappers that ended up with zero pills
    collapseEmptyBadgeLists(row);

    // Usernames
    softenUsernames(row);

    // Native channel-points redeem header — wrap reward name + cost so
    // the chip CSS can target them.
    processNativeRedeem(row);

    // Reply-quote tooltip — promote the full visible text into `title`
    // so the `cursor: help` affordance actually reveals the missing
    // tail when the ellipsis truncates the preview.
    tagReplyPreviewTooltip(row);
  }

  /**
   * Process every message currently in the document. Cheap because each row
   * short-circuits via its data-gs-pills marker.
   */
  function scanAll() {
    const rows = document.querySelectorAll(
      '[data-a-target="chat-line-message"], .seventv-message'
    );
    rows.forEach(processRow);
    processNativeNotices();
    softenUsernamesEverywhere();
  }

  /**
   * Catch-all username soften pass scoped to the entire document, not
   * just the rows the row-based scanner visits. Picks up usernames in
   * 7TV reply-thread popups, hover preview cards, and any future surface
   * 7TV / Twitch adds that renders a `.seventv-chat-user` or
   * `.chat-author__display-name` outside the standard chat row DOM.
   * Idempotent — the `:not([data-gs-color="1"])` filter inside
   * `softenUsernames` skips elements we've already processed.
   */
  function softenUsernamesEverywhere() {
    softenUsernames(document);
  }

  // ---- 3. observe new messages ---------------------------------------------

  /** @type {MutationObserver | null} */
  let observer = null;

  function startObserving() {
    if (observer) return;

    // Observe the entire body — chat may be inside any .chat-shell (channel
    // page, popout, theatre mode), and 7TV mounts its own renderer at
    // #seventv-message-container. Subtree + childList is enough; we don't
    // need attribute mutations for badges.
    observer = new MutationObserver((mutations) => {
      let sawNoticeCandidate = false;
      let sawAnyAddition = false;
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          sawAnyAddition = true;
          // Fast path: the added node IS a message row.
          if (
            node.matches?.(
              '[data-a-target="chat-line-message"], .seventv-message'
            )
          ) {
            processRow(node);
            sawNoticeCandidate = true;
            return;
          }
          // Otherwise: search inside it.
          if (node.querySelectorAll) {
            node
              .querySelectorAll(
                '[data-a-target="chat-line-message"], .seventv-message'
              )
              .forEach(processRow);
          }
          // Sub / watch-streak / raid notices have no chat-line__message
          // so they don't trigger the row branches above. Mark for a
          // notice sweep at the end of this batch.
          if (
            node.matches?.('[data-test-selector="user-notice-line"]') ||
            node.querySelector?.('[data-test-selector="user-notice-line"]')
          ) {
            sawNoticeCandidate = true;
          }
        });
      }
      if (sawNoticeCandidate) processNativeNotices();
      // Catch usernames mounted outside the standard row DOM (e.g. 7TV
      // reply-thread popups, hover preview cards). Cheap — the
      // `:not([data-gs-color="1"])` filter skips already-processed
      // elements, so on a typical mutation batch this is a single
      // index-friendly attribute query that returns zero matches.
      if (sawAnyAddition) softenUsernamesEverywhere();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---- 4. boot --------------------------------------------------------------

  // ---- enable/disable hooks (driven by content/toggle.js) ------------------

  /**
   * Undo every DOM-level change this script has made:
   *   - remove all injected `.gs-badge` pills
   *   - re-show original badge wrappers (we set inline display:none on them)
   *   - drop the `--gs-color` custom property + `data-gs-color` marker
   *     so the original Twitch inline color is visible again
   *   - drop the `data-gs-pills` row marker so the next rescan re-processes
   */
  function reset() {
    document.querySelectorAll(".gs-badge").forEach((el) => el.remove());
    document
      .querySelectorAll('[data-gs-processed="1"]')
      .forEach((el) => {
        const node = /** @type {HTMLElement} */ (el);
        node.style.display = "";
        node.removeAttribute("data-gs-processed");
      });
    document.querySelectorAll('[data-gs-color="1"]').forEach((el) => {
      const node = /** @type {HTMLElement} */ (el);
      node.removeAttribute("data-gs-color");
      node.style.removeProperty("--gs-color");
    });
    document
      .querySelectorAll(".seventv-chat-user-badge-list")
      .forEach((el) => {
        const node = /** @type {HTMLElement} */ (el);
        node.style.display = "";
      });
    document
      .querySelectorAll('[data-gs-pills="1"]')
      .forEach((el) => el.removeAttribute("data-gs-pills"));
  }

  // Toggle button (content/toggle.js) dispatches these on window when
  // the user flips the extension on/off.
  window.addEventListener("gs-reset", reset);
  window.addEventListener("gs-rescan", scanAll);

  // ---- 5. theme detection --------------------------------------------------
  //
  // Drives the `.gs-light` class on <html>, which all light-theme CSS
  // overrides are conditioned on. We do NOT depend on Twitch's own
  // `tw-root--theme-light` class as a CSS selector — Twitch shuffles class
  // names between redesigns, and a missed selector silently no-ops the
  // entire light-theme block. Instead we detect here and own the class.
  //
  // Detection order:
  //   1. Twitch's own theme class anywhere in the doc (works when present).
  //   2. Computed body background luminance (works regardless of class name).

  function isLightTheme() {
    if (document.querySelector(".tw-root--theme-light")) return true;
    if (document.querySelector(".tw-root--theme-dark")) return false;
    // Fallback: the chat panel inherits its surface from <body>. If body
    // bg parses to a light color (perceived luminance > 0.55 on Rec. 601),
    // we're on light theme.
    const bg = getComputedStyle(document.body).backgroundColor || "";
    const m = bg.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return false;
    const r = +m[1], g = +m[2], b = +m[3];
    const lum = (r * 299 + g * 587 + b * 114) / 1000 / 255;
    return lum > 0.55;
  }

  function syncThemeFlag() {
    document.documentElement.classList.toggle("gs-light", isLightTheme());
  }

  /** @type {MutationObserver | null} */
  let themeObserverHtml = null;
  /** @type {MutationObserver | null} */
  let themeObserverBody = null;

  function startThemeObserver() {
    // Twitch flips the theme class on <html> or a wrapper div. We can't
    // know which without guessing, so observe both <html> and <body>
    // attribute mutations and re-evaluate on any class change. Saved to
    // module-scope handles + idempotency guard so a second boot() call
    // (or future explicit teardown) doesn't accumulate observers.
    if (themeObserverHtml || themeObserverBody) return;
    const onAttr = () => syncThemeFlag();
    themeObserverHtml = new MutationObserver(onAttr);
    themeObserverHtml.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    themeObserverBody = new MutationObserver(onAttr);
    themeObserverBody.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  function boot() {
    syncThemeFlag();
    startThemeObserver();
    scanAll();
    startObserving();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
