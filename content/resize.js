/* =============================================================================
   GhostSplit Chat Theme — chat panel resize handle
   =============================================================================

   Adds a draggable left-edge handle to Twitch's `.channel-root__right-column`
   so the chat panel can be resized horizontally — same UX as the resize
   handle in GhostSplit's own chat (`styles/components/_chat.scss`
   `.resize-handle`). The video player in `.channel-root__main-column`
   fills the remaining space automatically because Twitch's layout flexes
   on the main column.

   Persistence: the chosen width is saved to `localStorage` under
   `gs-chat-width` and re-applied:
     1. on page load
     2. whenever a new `.channel-root__right-column` is mounted (covers SPA
        navigation between channels and theatre-mode toggles)

   Bounds: 240–800 px. Outside that the chat layout breaks (Twitch's
   internal grids assume a minimum width).

   Why JS: the resize itself needs continuous mousemove updates, plus
   reading and writing the column's inline width — both impossible from
   CSS alone.
   ============================================================================ */

(() => {
  "use strict";

  const STORAGE_KEY = "gs-chat-width";
  const MIN_WIDTH = 240;
  const MAX_WIDTH = 800;
  const HANDLE_ID = "gs-chat-resize-handle";
  const COLUMN_SELECTOR = ".channel-root__right-column";

  // ---- persistence ----------------------------------------------------------

  /** @returns {number | null} */
  function loadWidth() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n)) return null;
      if (n < MIN_WIDTH || n > MAX_WIDTH) return null;
      return n;
    } catch {
      return null;
    }
  }

  /** @param {number} w */
  function saveWidth(w) {
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.round(w)));
    } catch {
      /* localStorage may be blocked in some embeds; silently ignore */
    }
  }

  // ---- width application ----------------------------------------------------

  // ---- width application (inline style + watchdog) -------------------------

  /**
   * Force a width on a single element. Sets every relevant sizing
   * property because Twitch's layout uses several at different levels.
   * @param {HTMLElement | null | undefined} el
   * @param {string} px
   */
  function setEl(el, px) {
    if (!el) return;
    el.style.setProperty("width", px, "important");
    el.style.setProperty("min-width", px, "important");
    el.style.setProperty("max-width", px, "important");
    el.style.setProperty("flex-basis", px, "important");
  }

  /** @type {HTMLElement[]} */
  let watchedTargets = [];
  /** @type {MutationObserver | null} */
  let widthObserver = null;
  /** Last applied width (px). Used by the watchdog to detect React rewrites. */
  let appliedWidth = 0;
  /** True while we're writing styles ourselves — prevents observer loops. */
  let isSelfWriting = false;

  /**
   * Force a width on the right-column ONLY (no parent walking), then
   * install a watchdog so Twitch's React re-renders can't revert us.
   *
   * Earlier versions walked up 1–2 ancestors to also widen the layout
   * slot. That broke the page: the immediate ancestor is typically
   * `.channel-root` (the container holding both player + chat slots),
   * and setting a fixed width on it caused the player to overflow its
   * shrunken parent — leaving an empty black gap where the original
   * chat slot used to be while the chat overlapped elsewhere.
   *
   * The column has its own slot in Twitch's grid; widening JUST the
   * column makes the grid track expand naturally, the player flex-
   * shrinks to fit, and there's no gap.
   *
   * @param {HTMLElement} column
   * @param {number} w
   */
  function applyWidth(column, w) {
    const px = w + "px";
    appliedWidth = w;

    isSelfWriting = true;
    try {
      // Override likely-named CSS custom properties on the root and on
      // body. Some Twitch layouts consume one of these to size the
      // column's slot — when present, the layout reflows naturally.
      const candidateVars = [
        "--right-column-width",
        "--chat-width",
        "--chat-column-width",
        "--ext-right-column-width",
      ];
      for (const v of candidateVars) {
        document.documentElement.style.setProperty(v, px);
        document.body.style.setProperty(v, px);
      }

      // Set width directly on the column as a fallback for layouts that
      // don't use a CSS variable for the slot.
      setEl(column, px);

      // Sync the slide-animation transform with our new width so the
      // column lands flush against the right edge of the viewport.
      column.style.setProperty(
        "transform",
        `translateX(-${px}) translateZ(0px)`,
        "important"
      );
      column.style.setProperty("transition", "none", "important");

      // Shrink the player area so the video doesn't extend UNDER the
      // wider chat. Twitch positions the persistent player at
      // `position: absolute; width: 100%` so it doesn't yield to the
      // chat slot on its own — we explicitly carve out chat-width on
      // the right via margin-right on the main column AND a right
      // offset on the player container.
      const mainColumn = /** @type {HTMLElement | null} */ (
        document.querySelector(".channel-root__main-column")
      );
      if (mainColumn) {
        mainColumn.style.setProperty("margin-right", px, "important");
      }
      const players = document.querySelectorAll(
        ".persistent-player, .video-player, .video-player__container"
      );
      players.forEach((p) => {
        const el = /** @type {HTMLElement} */ (p);
        el.style.setProperty("right", px, "important");
        el.style.setProperty("width", `calc(100% - ${px})`, "important");
      });
    } finally {
      Promise.resolve().then(() => {
        isSelfWriting = false;
      });
    }

    watchedTargets = [column];
    const mainCol = document.querySelector(".channel-root__main-column");
    if (mainCol instanceof HTMLElement) watchedTargets.push(mainCol);
    installWatchdog();
  }

  /**
   * Install a MutationObserver on each managed element's `style`
   * attribute. When Twitch overwrites the inline width, re-apply.
   * Idempotent — safe to call multiple times; previous observer is
   * disconnected first.
   */
  function installWatchdog() {
    if (widthObserver) widthObserver.disconnect();

    widthObserver = new MutationObserver(() => {
      if (isSelfWriting) return;            // ignore our own writes
      if (!appliedWidth) return;
      const column = /** @type {HTMLElement | null} */ (
        document.querySelector(COLUMN_SELECTOR)
      );
      if (!column) return;
      const expected = appliedWidth + "px";
      if (column.style.width !== expected) {
        applyWidth(column, appliedWidth);
      }
    });

    for (const t of watchedTargets) {
      widthObserver.observe(t, {
        attributes: true,
        attributeFilter: ["style"],
      });
    }
  }

  // ---- handle injection -----------------------------------------------------

  /**
   * Inject the drag handle into the column. Idempotent — a column that
   * already has a handle is left alone.
   * @param {HTMLElement} column
   */
  function ensureHandle(column) {
    if (column.querySelector("#" + HANDLE_ID)) return;

    // Make sure the column is a containing block for the absolute handle.
    if (getComputedStyle(column).position === "static") {
      column.style.setProperty("position", "relative", "important");
    }

    const handle = document.createElement("div");
    handle.id = HANDLE_ID;
    handle.title = "Drag to resize chat";
    handle.style.cssText = [
      "position: absolute",
      "top: 0",
      "left: -4px",
      "bottom: 0",
      "width: 8px",
      "cursor: ew-resize",
      "z-index: 9999",
      "background: transparent",
      "transition: background-color 120ms ease",
      "user-select: none",
    ].join(";");

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;
    let pendingFrame = 0;
    let pendingX = 0;

    function setHandleBg(value) {
      handle.style.background = value;
    }

    handle.addEventListener("mouseenter", () => {
      if (!isDragging) setHandleBg("rgba(145, 71, 255, 0.35)");
    });
    handle.addEventListener("mouseleave", () => {
      if (!isDragging) setHandleBg("transparent");
    });

    handle.addEventListener("mousedown", (e) => {
      // left button only
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      startX = e.clientX;
      startWidth = column.getBoundingClientRect().width;
      setHandleBg("rgba(145, 71, 255, 0.6)");
      document.body.style.userSelect = "none";
      document.body.style.cursor = "ew-resize";
    });

    function flush() {
      pendingFrame = 0;
      // Drag LEFT (clientX decreases) → chat WIDER.
      const delta = startX - pendingX;
      let next = startWidth + delta;
      if (next < MIN_WIDTH) next = MIN_WIDTH;
      if (next > MAX_WIDTH) next = MAX_WIDTH;
      applyWidth(column, next);
    }

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      pendingX = e.clientX;
      if (!pendingFrame) {
        pendingFrame = requestAnimationFrame(flush);
      }
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      if (pendingFrame) {
        cancelAnimationFrame(pendingFrame);
        pendingFrame = 0;
        flush();
      }
      const finalWidth = column.getBoundingClientRect().width;
      saveWidth(finalWidth);
      setHandleBg("transparent");
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    });

    column.appendChild(handle);
  }

  // ---- setup pass -----------------------------------------------------------

  /**
   * Find the right-column, inject the handle, and apply the saved width
   * (if any). Idempotent.
   */
  function setupColumn() {
    const column = /** @type {HTMLElement | null} */ (
      document.querySelector(COLUMN_SELECTOR)
    );
    if (!column) return;
    ensureHandle(column);
    const saved = loadWidth();
    if (saved !== null) applyWidth(column, saved);
  }

  // ---- observe SPA / theatre-mode column re-mounts --------------------------

  /** @type {MutationObserver | null} */
  let observer = null;

  function startObserving() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      // Only act if a node matching (or containing) the right-column was
      // added. Cheap early-exit so we don't churn on every chat message.
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (
            node.matches?.(COLUMN_SELECTOR) ||
            node.querySelector?.(COLUMN_SELECTOR)
          ) {
            setupColumn();
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---- boot -----------------------------------------------------------------

  function boot() {
    setupColumn();
    startObserving();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
