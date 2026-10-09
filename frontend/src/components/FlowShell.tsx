import type { ReactNode } from "react";
import { whenIcon, whenLabel } from "../data/time";
import type { When } from "../data/types";

interface Props {
  title: string;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  when?: When;
  onWhen?: () => void;
  footer?: ReactNode;
  /** Top-level screens show the menu instead of a close button; on desktop the sidebar replaces both. */
  onMenu?: () => void;
  /** Extra header buttons, e.g. "log again" on the edit screen. */
  actions?: ReactNode;
  children: ReactNode;
}

export function FlowShell({ title, canGoBack, onBack, onClose, onMenu, when, onWhen, footer, actions, children }: Props) {
  return (
    <div className="flow">
      <header className="flow-header">
        {canGoBack ? (
          <button className="icon-btn" onClick={onBack} aria-label="Back">
            ‹
          </button>
        ) : onMenu ? (
          <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Menu">
            ☰
          </button>
        ) : (
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
        <h1>{title}</h1>
        {when && onWhen && (
          <button className="when-chip" onClick={onWhen}>
            {whenIcon(when, true)} {whenLabel(when, false, true)}
          </button>
        )}
        {actions}
      </header>
      <main className="flow-body">{children}</main>
      {footer && <footer className="flow-footer">{footer}</footer>}
    </div>
  );
}
