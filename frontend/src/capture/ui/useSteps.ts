import { useLocation, useNavigate } from "react-router";

/** Kept in each history entry, so back and forward replay steps and a reload stays on one. */
export interface StepState {
  step?: string;
  /** Entries since the screen's own one, which is 1. */
  depth?: number;
  /** Set when the screen was opened from inside the app, so stepping back out of it stays in the app. */
  inApp?: boolean;
  [key: string]: unknown;
}

/**
 * Steps within one screen, each a history entry on the screen's URL, so the phone's back
 * gesture and the browser's forward button move between them.
 */
export function useSteps<S extends string>(first: S, onExit?: () => void, exitTo = "/") {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as StepState;
  const depth = state.depth ?? 1;
  const here = location.pathname + location.search;

  const go = (step: S) => navigate(here, { state: { ...state, step, depth: depth + 1 } });
  const back = () => navigate(-1);
  /** Swaps the current step without adding history, e.g. scanner → amount. */
  const replace = (step: S) => navigate(here, { replace: true, state: { ...state, step } });
  const close = () => {
    onExit?.();
    // Opened by a link or a reload there is nothing of ours to step back to, so go to the parent instead.
    if (state.inApp) navigate(-depth);
    else navigate(exitTo, { replace: true });
  };

  return { step: (state.step as S | undefined) ?? first, depth, go, back, replace, close };
}

/** Opening a screen from inside the app marks it, so its close steps back instead of replacing. */
export function useOpen() {
  const navigate = useNavigate();
  return (path: string, extra?: Record<string, unknown>) => navigate(path, { state: { inApp: true, ...extra } });
}
