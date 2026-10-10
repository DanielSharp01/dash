import { useSyncExternalStore } from "react";

export interface Notice {
  message: string;
  undo?: () => void;
  action?: { label: string; run: () => void };
}

export type Notify = (message: string, undo?: () => void, action?: Notice["action"]) => void;

/** One toast at a time, reachable from outside React so a failed save can say so after its screen closed. */
let current: (Notice & { id: number }) | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const notify: Notify = (message, undo, action) => {
  current = { id: Date.now(), message, undo, action };
  emit();
};

export const dismiss = () => {
  current = undefined;
  emit();
};

export const useNotice = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
