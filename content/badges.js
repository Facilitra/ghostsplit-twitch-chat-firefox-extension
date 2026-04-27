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
    if (prefixText) {
      // Trailing space so "Canjeado: " sits visually apart from the
      // chip. The 7TV original is " redeemed " with whitespace either
      // side — we mirror that.
      rewardLeft.appendChild(document.createTextNode(prefixText + " "));
    }
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

    // Tag the user-message section (the direct child of the
    // user-notice-line that contains the actual chat-line__message) so
    // CSS can reset its row chrome.
    for (const child of Array.from(wrapper.children)) {
      if (child.querySelector(":scope .chat-line__message")) {
        child.classList.add("gs-redeem-message");
        break;
      }
    }
  }

  /**
   * Star SVG for the GhostSplit-style sub notice. The original
   * GhostSplit chat client loads /assets/icons/star.svg, but a content
   * script can't fetch site-relative assets without a
   * web_accessible_resources declaration, so we inline the path. Class
   * is added on the imported element rather than via the source string
   * to keep DOMParser as the only entry point (no innerHTML).
   */
  const STAR_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
         aria-hidden="true" focusable="false">
      <path d="M12 2 L14.85 8.6 L22 9.3 L16.5 14 L18.1 21 L12 17.3 L5.9 21 L7.5 14 L2 9.3 L9.15 8.6 Z"/>
    </svg>
  `;

  /**
   * @returns {SVGElement | null}
   */
  function buildStarIcon() {
    const svgDoc = new DOMParser().parseFromString(STAR_SVG, "image/svg+xml");
    const svg = svgDoc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg") return null;
    const imported = /** @type {SVGElement} */ (document.importNode(svg, true));
    imported.setAttribute("class", "gs-notice-icon");
    return imported;
  }

  /**
   * Native sub / resub / Prime / gift notices land inside a
   * user-notice-line wrapper with a chunky multi-element layout
   * (icon column + paragraph with chatter-name + emphasized spans +
   * Prime link). The original GhostSplit chat client renders the
   * equivalent as a flat single-line notice:
   *
   *   <div class="chat-message notice chat-message-system chat-message-system-sub">
   *     <span class="chat-notice-wrap">
   *       <img class="chat-notice-icon" src=".../star.svg" />
   *       <span class="chat-notice-text">{flattened text}</span>
   *     </span>
   *   </div>
   *
   * That's what this function builds — a star icon plus the
   * paragraph's textContent, on one line, in the blue notice card.
   * We use `gs-notice-*` class names instead of GhostSplit's
   * `chat-notice-*` to avoid colliding with anything Twitch ships.
   *
   * Detection: inside a user-notice-line, NOT a channel-points redeem
   * (no .channel-points-reward-line__icon), and the text content
   * matches a sub/gift keyword in either Spanish or English.
   *
   * @param {Element} row
   */
  function processNativeSubNotice(row) {
    const wrapper = row.closest('[data-test-selector="user-notice-line"]');
    if (!wrapper) return;
    if (wrapper.dataset.gsSubNotice === "1") return;
    if (wrapper.querySelector(".channel-points-reward-line__icon")) return;

    const text = wrapper.textContent || "";
    if (!/\b(subscrib|suscrit|suscripci|gifted|regalad)/i.test(text)) return;

    wrapper.dataset.gsSubNotice = "1";

    const paragraph = wrapper.querySelector("p");
    if (!paragraph) return;

    // Flatten the paragraph's mixed content (chatter-name span +
    // emphasized spans + Prime link + text nodes) into a single
    // whitespace-collapsed string. That's what the GhostSplit notice
    // shows.
    const noticeText = (paragraph.textContent || "").trim().replace(/\s+/g, " ");
    if (!noticeText) return;

    const wrap = document.createElement("span");
    wrap.className = "gs-notice-wrap";

    const icon = buildStarIcon();
    if (icon) wrap.appendChild(icon);

    const textSpan = document.createElement("span");
    textSpan.className = "gs-notice-text";
    textSpan.textContent = noticeText;
    wrap.appendChild(textSpan);

    // Replace the user-notice-line content with our flat notice.
    while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
    wrapper.appendChild(wrap);

    // Tag the outer wrapper so the notice-card CSS picks it up. We
    // also add `gs-notice-card-sub` for sub-specific palette overrides.
    const cardWrapper = wrapper.parentElement;
    if (cardWrapper) {
      cardWrapper.classList.add("gs-notice-card", "gs-notice-card-sub");
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
        processNativeSubNotice(wrapper);
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

    // Native channel-points redeem header — wrap reward name + cost so
    // the chip CSS can target them.
    processNativeRedeem(row);
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
