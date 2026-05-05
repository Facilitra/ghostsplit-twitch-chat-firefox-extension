/* =============================================================================
   GhostSplit Chat Theme — top-nav status indicator
   =============================================================================

   Adds a small icon to Twitch's top navigation as a passive "loaded"
   indicator. NOT clickable for toggling — earlier versions let users
   disable the extension here, but that broke co-installed extensions
   (7TV in particular) and added complexity. The icon is now purely a
   visual reminder that the theme is active.

   Positioning: docked immediately after the whisper-box-button's nav
   wrapper when logged in, or after the prime-offers-icon wrapper when
   logged out (whisper button isn't rendered for guests). Re-positioned
   on any DOM mutation that pushes another item past us (e.g. 7TV
   mounting its button after ours on SPA navigation, or the user
   logging in and the whisper button appearing).

   Scope: only runs on `twitch.tv` and `www.twitch.tv`. Subdomains
   (dashboard, safety, m, etc.) are matched by the manifest pattern but
   don't carry the standard top nav we anchor against, so the script
   bails out at the top of the IIFE on those hosts.
   ============================================================================ */

(() => {
  "use strict";

  // Only run on the main twitch.tv host. Subdomains like dashboard.twitch.tv,
  // safety.twitch.tv, etc. are matched by the manifest's `*://*.twitch.tv/*`
  // pattern but don't carry the standard top nav we anchor against, so the
  // ghost would either fail to mount or land in the wrong slot.
  const host = window.location.hostname;
  if (host !== "twitch.tv" && host !== "www.twitch.tv") return;

  const BUTTON_ID = "gs-toggle-button";

  /**
   * Anchors we'll dock the indicator against, in priority order. When
   * logged in, the whisper-box-button is always present; when logged
   * out it's absent, but the prime-offers-icon (the crown in the nav)
   * is rendered for guests and lands at the same nav-item depth, so
   * it's the natural fallback.
   *
   * Selectors are intentionally string-typed because Twitch uses
   * `data-a-target` for the whisper button but plain `data-target` for
   * the prime crown — both real, both shipping in current Twitch
   * markup.
   */
  const ANCHOR_SELECTORS = [
    '[data-a-target="whisper-box-button"]',
    '[data-target="prime-offers-icon"]',
  ];

  /**
   * Find the nav-item wrapper to dock against.
   *
   * Pass A (7TV present) — walk up from the anchor until the parent
   * also contains `#seventv-settings-button` as a sibling. That level
   * matches the rest of the nav-item wrappers regardless of Twitch's
   * CSS-in-JS hashed class names.
   *
   * Pass B (no 7TV) — walk up from the anchor's enclosing <button>
   * until we hit a parent that is a horizontal flex row with multiple
   * children. That's the top-nav item row.
   *
   * The prime-offers-icon fallback (logged-out state) sits at a
   * different DOM depth than the whisper-box-button, so a hardcoded
   * level count gets one of them wrong — when we overshoot, the
   * indicator ends up as a sibling of the entire nav row inside a
   * column layout, which renders the ghost icon BELOW the prime crown
   * instead of next to it. Detecting the row by layout (flex-direction
   * !== column AND parent has siblings) self-corrects per anchor.
   *
   * @returns {Element | null} the anchor's nav-item wrapper, or null
   *   if neither anchor is mounted yet.
   */
  function findAnchorWrapper() {
    let anchor = null;
    for (const sel of ANCHOR_SELECTORS) {
      anchor = document.querySelector(sel);
      if (anchor) break;
    }
    if (!anchor) return null;

    // Pass A — 7TV docking point.
    let el = anchor;
    while (el.parentElement) {
      if (
        el.parentElement.querySelector(":scope > #seventv-settings-button")
      ) {
        return el;
      }
      el = el.parentElement;
      if (el === document.body) break;
    }

    // Pass B — climb to the natural nav-item row. Start from the
    // enclosing <button> when the anchor is an inner SVG (the prime
    // crown case), so we don't get stranded inside the button next to
    // its notification badge.
    el = anchor.closest("button") || anchor;
    while (el.parentElement && el.parentElement !== document.body) {
      const parent = el.parentElement;
      const cs = getComputedStyle(parent);
      const display = cs.display;
      const direction = cs.flexDirection || "row";
      const isHorizontalRow =
        (display === "flex" || display === "inline-flex") &&
        !direction.startsWith("column");
      if (isHorizontalRow && parent.children.length >= 2) {
        return el;
      }
      el = parent;
    }
    return el;
  }

  /**
   * The animated ghost icon — copied from `assets/ghost-icon-anim.svg`,
   * inlined here so the CSS keyframes (float + blink) embedded inside
   * the SVG ship with the script (no `web_accessible_resources` needed).
   * Class names have been prefixed with `gs-` to avoid clashing with
   * any other `.float` / `.eyelid` rules on the page.
   */
  const GHOST_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -18 500 518"
         role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <defs>
        <style>
          @keyframes gsGhostFloat {
            0%, 100% { transform: translate(0px, 0px); }
            50%      { transform: translate(0px, -18px); }
          }
          @keyframes gsEyelidBlink {
            0%, 42%, 100% { transform: scaleY(0); }
            43%, 45%      { transform: scaleY(1.15); }
            46%           { transform: scaleY(0); }
            86%           { transform: scaleY(0); }
            87%, 89%      { transform: scaleY(1.15); }
            90%           { transform: scaleY(0); }
          }
          .gs-piece {
            transform-box: fill-box;
            transform-origin: center;
            will-change: transform;
          }
          .gs-float  { animation: gsGhostFloat 3.2s ease-in-out infinite; }
          .gs-eyelid {
            transform-box: fill-box;
            transform-origin: center;
            transform: scaleY(0);
            animation: gsEyelidBlink 4.8s ease-in-out infinite;
            will-change: transform;
          }
          @media (prefers-reduced-motion: reduce) {
            .gs-float, .gs-eyelid { animation: none !important; }
          }
        </style>
        <mask id="gsGhostMask" maskUnits="userSpaceOnUse">
          <rect x="0" y="-18" width="500" height="518" fill="black"/>
          <path d="M 250.003 0.484 C 360.236 0.484 449.614 89.834 449.614 200.098 L 449.614 499.516 L 326.876 474.563 L 250.023 499.516 L 175.37 474.563 L 50.387 499.516 L 50.387 200.098 C 50.387 89.834 139.765 0.484 250.003 0.484 Z" fill="white"/>
          <g fill="black">
            <path d="M 187.622 250 C 208.308 250 225.049 233.232 225.049 212.573 C 225.049 191.887 208.308 175.146 187.622 175.146 C 166.965 175.146 150.196 191.887 150.196 212.573 C 150.196 233.232 166.965 250 187.622 250 Z"/>
            <path d="M 312.381 250 C 333.067 250 349.809 233.232 349.809 212.573 C 349.809 191.887 333.067 175.146 312.381 175.146 C 291.719 175.146 274.954 191.887 274.954 212.573 C 274.954 233.232 291.719 250 312.381 250 Z"/>
            <path d="M 318.252 356.444 A 68.252 68.252 0 1 0 181.748 356.444 A 68.252 68.252 0 1 0 318.252 356.444 Z"/>
          </g>
        </mask>
      </defs>
      <g class="gs-piece gs-float">
        <path d="M 250.003 0.484 C 360.236 0.484 449.614 89.834 449.614 200.098 L 449.614 499.516 L 326.876 474.563 L 250.023 499.516 L 175.37 474.563 L 50.387 499.516 L 50.387 200.098 C 50.387 89.834 139.765 0.484 250.003 0.484 Z"
              fill="currentColor" stroke="currentColor" stroke-width="1"
              mask="url(#gsGhostMask)" style="fill-rule: evenodd;"/>
        <g class="gs-eyelid" fill="currentColor">
          <path d="M 187.622 250 C 208.308 250 225.049 233.232 225.049 212.573 C 225.049 191.887 208.308 175.146 187.622 175.146 C 166.965 175.146 150.196 191.887 150.196 212.573 C 150.196 233.232 166.965 250 187.622 250 Z"/>
          <path d="M 312.381 250 C 333.067 250 349.809 233.232 349.809 212.573 C 349.809 191.887 333.067 175.146 312.381 175.146 C 291.719 175.146 274.954 191.887 274.954 212.573 C 274.954 233.232 291.719 250 312.381 250 Z"/>
        </g>
        <path d="M 269.89 349.216 C 275.22 352.369 275.22 360.525 269.89 363.672 L 237.668 382.694 C 232.487 385.758 226.112 381.772 226.112 375.466 L 226.112 337.422 C 226.112 331.122 232.487 327.137 237.668 330.194 L 269.89 349.216 Z"
              fill="currentColor" stroke-width="0"/>
      </g>
    </svg>
  `;

  /**
   * Build the indicator element using explicit DOM APIs (no innerHTML).
   * The SVG is parsed via DOMParser into a detached document and the
   * root element is then `importNode`-d into ours — this avoids the
   * `unsafe-var-assignment` lint flag that fires on any
   * `element.innerHTML = …` assignment, even when the assigned string
   * is fully static like ours.
   */
  function buildEl() {
    const wrapper = document.createElement("div");
    wrapper.id = BUTTON_ID;
    wrapper.className = "seventv-tw-button gs-toggle-button";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.tabIndex = -1;
    btn.setAttribute("aria-label", "GhostSplit theme loaded");

    // Parse the static SVG string as XML and graft the root <svg> into
    // our button. SVG-embedded <style> blocks survive the importNode
    // because they're carried as child nodes of the SVG element.
    const svgDoc = new DOMParser().parseFromString(GHOST_SVG, "image/svg+xml");
    const svgRoot = svgDoc.documentElement;
    if (svgRoot && svgRoot.nodeName.toLowerCase() === "svg") {
      btn.appendChild(document.importNode(svgRoot, true));
    }

    const tooltip = document.createElement("span");
    tooltip.className = "tooltip-under gs-tooltip";
    tooltip.textContent = "GhostSplit theme loaded";

    wrapper.appendChild(btn);
    wrapper.appendChild(tooltip);

    // Visual indicator only — block clicks so we never absorb a stray
    // navigation gesture or get treated as an interactive control.
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    return wrapper;
  }

  /**
   * Ensure the indicator exists AND sits immediately after its anchor
   * wrapper (whisper-box-button when logged in, prime-offers-icon when
   * logged out). Putting it ANYWHERE else (e.g. appending to the end
   * of the nav) shifts 7TV's settings button out of its expected slot,
   * so we anchor specifically to one of those neighbors.
   */
  function ensurePinned() {
    const anchorWrapper = findAnchorWrapper();
    if (!anchorWrapper || !anchorWrapper.parentNode) return;

    let el = document.getElementById(BUTTON_ID);
    if (!el) el = buildEl();

    // Insert AFTER the anchor wrapper (so order becomes
    // [anchor] → [GS] → [7TV settings] → […]). If we're already in
    // that exact slot, do nothing.
    if (
      el.parentNode !== anchorWrapper.parentNode ||
      el.previousElementSibling !== anchorWrapper
    ) {
      anchorWrapper.parentNode.insertBefore(el, anchorWrapper.nextSibling);
    }
  }

  /** @type {MutationObserver | null} */
  let pinObserver = null;

  function init() {
    ensurePinned();
    // Saved to module-scope handle + idempotency guard so a second init()
    // (defensive — only fires once today) wouldn't accumulate observers
    // on document.body with subtree:true (which fires on every chat row).
    if (pinObserver) return;
    pinObserver = new MutationObserver(() => ensurePinned());
    pinObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
