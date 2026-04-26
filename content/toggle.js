/* =============================================================================
   GhostSplit Chat Theme — top-nav status indicator
   =============================================================================

   Adds a small icon to Twitch's top navigation as a passive "loaded"
   indicator. NOT clickable for toggling — earlier versions let users
   disable the extension here, but that broke co-installed extensions
   (7TV in particular) and added complexity. The icon is now purely a
   visual reminder that the theme is active.

   Positioning: always inserted as the LAST child of the nav container
   so it stays visually after every other nav item. Re-positioned on
   any DOM mutation that pushes another item past us (e.g. 7TV mounting
   its button after ours on SPA navigation).
   ============================================================================ */

(() => {
  "use strict";

  const BUTTON_ID = "gs-toggle-button";

  /**
   * Find the whisper-box-button's outer nav wrapper — the element that
   * sits at the same level as `#seventv-settings-button`. Walking up
   * from the button until we find an ancestor whose parent contains
   * the 7TV button as a sibling gives us the right level even though
   * Twitch's class names are CSS-in-JS hashes that change between
   * builds.
   *
   * Fallback (no 7TV installed): walk up a fixed 4 levels from the
   * whisper button — empirically that lands on the same nav-item
   * wrapper depth as the rest of the nav.
   *
   * @returns {Element | null} the whisper button's nav-item wrapper
   */
  function findWhisperWrapper() {
    const whisper = document.querySelector(
      '[data-a-target="whisper-box-button"]'
    );
    if (!whisper) return null;

    let el = whisper;
    while (el.parentElement) {
      if (
        el.parentElement.querySelector(":scope > #seventv-settings-button")
      ) {
        return el; // el is sibling of #seventv-settings-button
      }
      el = el.parentElement;
      if (el === document.body) break;
    }

    // 7TV not present — fall back to fixed depth.
    el = whisper;
    for (let i = 0; i < 4 && el.parentElement; i++) {
      el = el.parentElement;
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
   * Ensure the indicator exists AND sits immediately after the
   * whisper-box-button's nav wrapper. Putting it ANYWHERE else (e.g.
   * appending to the end of the nav) shifts 7TV's settings button out
   * of its expected slot, so we anchor specifically to the whisper
   * neighbor.
   */
  function ensurePinned() {
    const whisperWrapper = findWhisperWrapper();
    if (!whisperWrapper || !whisperWrapper.parentNode) return;

    let el = document.getElementById(BUTTON_ID);
    if (!el) el = buildEl();

    // Insert AFTER the whisper wrapper (so order becomes
    // [whisper] → [GS] → [7TV settings] → […]). If we're already in
    // that exact slot, do nothing.
    if (
      el.parentNode !== whisperWrapper.parentNode ||
      el.previousElementSibling !== whisperWrapper
    ) {
      whisperWrapper.parentNode.insertBefore(el, whisperWrapper.nextSibling);
    }
  }

  function init() {
    ensurePinned();
    new MutationObserver(() => ensurePinned()).observe(document.body, {
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
