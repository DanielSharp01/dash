export interface Notice {
  message: string;
  undo?: () => void;
  action?: { label: string; run: () => void };
}

export type Notify = (message: string, undo?: () => void, action?: Notice["action"]) => void;
