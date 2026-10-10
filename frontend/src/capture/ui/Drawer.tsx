import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Wide enough to start inside the screen edge: on Android with gesture navigation the outermost
 * strip belongs to the system's back gesture and never reaches the page.
 */
const EDGE = 40;
/** Movement before a touch counts as a horizontal swipe rather than a scroll or a tap. */
const LOCK = 10;
/** px/ms; a flick this fast opens or closes regardless of how far it went. */
const FLICK = 0.3;

const drawerWidth = () => Math.min(300, window.innerWidth * 0.82);

interface Gesture {
  startX: number;
  startY: number;
  startTime: number;
  /** How much of the drawer showed when the touch began. */
  base: number;
  axis?: "x" | "y";
}

/** The side menu; it follows the finger, opening from the left edge and closing with a swipe left. */
export function Drawer({
  open,
  onOpenChange,
  swipeToOpen,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only top-level screens open it by swipe; flows keep the edge for their own back gesture. */
  swipeToOpen: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  /** How much of the drawer is showing, in px. */
  const [shown, setShown] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames, so the closed position paints first and the slide-in is a transition.
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setShown(drawerWidth())));
      return () => cancelAnimationFrame(frame);
    }
    setShown(0);
  }, [open]);

  // Unmounted after the slide-out; a timer rather than transitionend, which reduced motion never fires.
  useEffect(() => {
    if (open || dragging) return;
    const t = setTimeout(() => setMounted(false), 250);
    return () => clearTimeout(t);
  }, [open, dragging]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      gesture.current = null;
      if (e.touches.length !== 1 || !t) return;
      if (openRef.current) gesture.current = { startX: t.clientX, startY: t.clientY, startTime: e.timeStamp, base: drawerWidth() };
      else if (swipeToOpen && t.clientX <= EDGE) gesture.current = { startX: t.clientX, startY: t.clientY, startTime: e.timeStamp, base: 0 };
    };

    const onMove = (e: TouchEvent) => {
      const g = gesture.current;
      const t = e.touches[0];
      if (!g || !t) return;
      const dx = t.clientX - g.startX;
      const dy = t.clientY - g.startY;
      if (!g.axis) {
        if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (g.axis === "y") return;
        setMounted(true);
        setDragging(true);
      }
      if (g.axis !== "x") return;
      // Keeps the page from scrolling under a sideways drag.
      e.preventDefault();
      setShown(Math.min(Math.max(g.base + dx, 0), drawerWidth()));
    };

    const onEnd = (e: TouchEvent) => {
      const g = gesture.current;
      gesture.current = null;
      if (!g || g.axis !== "x") return;
      const t = e.changedTouches[0];
      const dx = (t?.clientX ?? g.startX) - g.startX;
      const velocity = dx / Math.max(e.timeStamp - g.startTime, 1);
      const width = drawerWidth();
      const position = Math.min(Math.max(g.base + dx, 0), width);
      const shouldOpen = velocity > FLICK ? true : velocity < -FLICK ? false : position > width / 2;
      setDragging(false);
      setShown(shouldOpen ? width : 0);
      if (shouldOpen !== openRef.current) onOpenChange(shouldOpen);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [swipeToOpen, onOpenChange]);

  if (!mounted) return null;
  const width = drawerWidth();
  const still = dragging ? { transition: "none" } : {};

  return (
    <div
      className="drawer-backdrop"
      style={{ opacity: shown / width, pointerEvents: open || dragging ? "auto" : "none", ...still }}
      onClick={() => onOpenChange(false)}
    >
      <nav className="drawer" style={{ transform: `translateX(${shown - width}px)`, ...still }} onClick={(e) => e.stopPropagation()} aria-label="Main" aria-hidden={!open}>
        <div className="drawer-brand">Dash</div>
        {children}
      </nav>
    </div>
  );
}
