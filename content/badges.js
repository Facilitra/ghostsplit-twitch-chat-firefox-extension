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

    // prime / premium gaming
    { match: /^(prime|prime gaming|premium)$/i, cls: "gs-badge-premium", label: "PRIME" },

    // cheer / bits — alt: "cheer 100", "cheer 1000", "cheer 5000", etc.
    { match: /^cheer\s*\d+/i, cls: "gs-badge-bits", label: "BITS" },

    // subscriber — must be LAST in the sub-related group; alt examples:
    //   "Suscriptor", "Suscriptor durante 9 meses", "Suscriber",
    //   "Subscriber", "Subscriber for 1 year". The trailing variants of
    //   "X meses/años" are absorbed by .* at the end.
    { match: /^(suscriptor|subscriber|sub)\b/i, cls: "gs-badge-subscriber", label: "SUB" },
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
    pill.textContent = match.label;
    pill.title = text; // hover keeps the original alt for context
    pill.setAttribute("aria-label", text);
    pill.dataset.gsBadge = match.label;
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
   * src/utils/colorHelpers.ts → softenChatColor() does (dark theme branch
   * only — Twitch chat is always dark in our extension's scope).
   *
   * - Mix the input color toward a light base rgb(220,220,235) at weight
   *   0.78 (i.e. 0.65 × 1.2, the dark-mode coefficient from the source).
   * - If the result's perceived luminance (Rec. 601) exceeds 0.8, re-mix
   *   the original color toward a darker base rgb(80,80,100) at 0.8 so
   *   neon-bright names don't read as white-on-white.
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
  function softenUsernames(row) {
    // Native Twitch:  .chat-author__display-name  (inline style on the span)
    // 7TV:             .seventv-chat-user           (inline style on a div wrapper)
    const targets = row.querySelectorAll(
      ".chat-author__display-name, .seventv-chat-user"
    );
    targets.forEach((el) => {
      const node = /** @type {HTMLElement} */ (el);
      if (node.dataset.gsColor === "1") return;
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
   * Process all badges + soften usernames inside one message row.
   * Idempotent.
   * @param {Element} row
   */
  function processRow(row) {
    if (row.dataset.gsPills === "1") return;
    row.dataset.gsPills = "1";

    // Badges
    const badges = row.querySelectorAll(
      'button[data-a-target="chat-badge"] img, .seventv-chat-badge img'
    );
    badges.forEach((img) => processBadgeImg(/** @type {HTMLImageElement} */ (img)));

    // Hide 7TV badge wrappers that ended up with zero pills
    collapseEmptyBadgeLists(row);

    // Usernames
    softenUsernames(row);
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
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          // Fast path: the added node IS a message row.
          if (
            node.matches?.(
              '[data-a-target="chat-line-message"], .seventv-message'
            )
          ) {
            processRow(node);
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
        });
      }
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

  function boot() {
    scanAll();
    startObserving();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
