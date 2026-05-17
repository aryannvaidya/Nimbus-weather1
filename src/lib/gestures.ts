
export function initGestures() {
  if (typeof window === 'undefined') return;

  // ── CONFIG ──────────────────────────────────────
  const SWIPE_THRESHOLD   = 50;
  const PULL_THRESHOLD    = 75;
  const LOCK_ANGLE        = 15; // degrees — axis lock

  // ── STATE ───────────────────────────────────────
  let startX   = 0;
  let startY   = 0;
  let axis: 'h' | 'v' | null = null;
  let active   = false;

  // ── HELPERS ─────────────────────────────────────
  const isInteractive = (el: HTMLElement | null): boolean => {
    if (!el) return false;
    return !!el.closest(
      'input, button, select, textarea, [data-no-swipe]'
    );
  };

  // ── PULL INDICATOR ──────────────────────────────
  const indicator = document.createElement("div");
  indicator.id = "gesture-pull-indicator";
  indicator.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0;
    height: 65px; overflow: hidden;
    display: flex; align-items: center; 
    justify-content: center;
    color: #ffffff80; font-size: 13px;
    background: #ffffff08;
    transform: translateY(-100%);
    will-change: transform;
    transition: transform 0.15s cubic-bezier(0.22, 1, 0.36, 1);
    z-index: 9999; pointer-events: none;
    font-family: system-ui, -apple-system, sans-serif;
  `;
  document.body.prepend(indicator);

  let rafId: number | null = null;

  // ── POINTER DOWN ────────────────────────────────
  const onPointerDown = (e: PointerEvent) => {
    if (isInteractive(e.target as HTMLElement)) return;
    startX = e.clientX;
    startY = e.clientY;
    axis   = null;
    active = true;
  };

  // ── POINTER MOVE ────────────────────────────────
  const onPointerMove = (e: PointerEvent) => {
    if (!active) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dist = Math.sqrt(dx*dx + dy*dy);

    // Lock axis after 12px movement
    if (!axis && dist > 12) {
      const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
      if (angle < 90 - LOCK_ANGLE || angle > 90 + LOCK_ANGLE) {
        axis = "h";
      } else {
        axis = "v";
      }
    }

    // Interactive Swipe Handling
    if (axis === "h") {
      const swipeLayer = document.getElementById("swipe-layer");
      if (swipeLayer) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          // Add some resistance or just direct mapping
          swipeLayer.style.transition = "none";
          swipeLayer.style.transform = `translateX(${dx}px) translateZ(0)`;
          rafId = null;
        });
      }
    }

    // Handle pull indicator with requestAnimationFrame
    if (axis === "v" && dy > 0 && window.scrollY === 0) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const pull = Math.min(dy, 130);
        const translatePercent = Math.max(-100, -100 + (pull / 130) * 100);
        indicator.style.transform = `translateY(${translatePercent}%)`;
        indicator.textContent = 
          pull >= PULL_THRESHOLD ? "↓ Release to refresh" 
                                 : "↓ Pull to refresh";
        rafId = null;
      });
    }
  };

  // ── POINTER UP ──────────────────────────────────
  const onPointerUp = (e: PointerEvent) => {
    if (!active) return;
    active = false;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (rafId) cancelAnimationFrame(rafId);
    requestAnimationFrame(() => {
      indicator.style.transform = "translateY(-100%)";
      indicator.textContent  = "";
      
      const swipeLayer = document.getElementById("swipe-layer");
      if (swipeLayer) {
        swipeLayer.style.transition = "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
        swipeLayer.style.transform = "translateX(0) translateZ(0)";
      }
    });

    if (axis === "h") {
      // SWIPE
      if (dx < -SWIPE_THRESHOLD) {
        window.dispatchEvent(new CustomEvent("swipe-left"));
      } else if (dx > SWIPE_THRESHOLD) {
        window.dispatchEvent(new CustomEvent("swipe-right"));
      }

    } else if (axis === "v") {
      // PULL TO REFRESH
      if (dy >= PULL_THRESHOLD && window.scrollY === 0) {
        window.dispatchEvent(new CustomEvent("pull-refresh"));
      }
    }

    axis = null;
  };

  const onPointerCancel = () => {
    active = false;
    axis   = null;
    indicator.style.height = "0";
  };

  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerup", onPointerUp, { passive: true });
  document.addEventListener("pointercancel", onPointerCancel, { passive: true });

  return () => {
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerCancel);
    indicator.remove();
  };
}
