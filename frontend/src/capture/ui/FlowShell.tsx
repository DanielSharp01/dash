import type { ReactNode } from "react";
import { whenIcon, whenLabel } from "../../core/time";
import type { When } from "../../core/types";

interface Props {
  title: string;
  /** What is being logged, under the title: an item's variant or a recipe's batch. */
  subtitle?: ReactNode;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  when?: When;
  onWhen?: () => void;
  footer?: ReactNode;
  /** Top-level screens show the menu instead of a close button. */
  onMenu?: () => void;
  actions?: ReactNode;
  children: ReactNode;
}

export function FlowShell({ title, subtitle, canGoBack, onBack, onClose, onMenu, when, onWhen, footer, actions, children }: Props) {
  return (
    <div className="flow">
      <header className="flow-header">
        {canGoBack ? (
          <button className="icon-btn" onClick={onBack} aria-label="Back">
            ‹
          </button>
        ) : onMenu ? (
          <button className="icon-btn" onClick={onMenu} aria-label="Menu">
            ☰
          </button>
        ) : (
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
        <div className="flow-title">
          <h1>{title}</h1>
          {subtitle && <span>{subtitle}</span>}
        </div>
        {when && onWhen && (
          <button className="when-chip" onClick={onWhen}>
            {whenIcon(when, true)} {whenLabel(when, true, true)}
          </button>
        )}
        {actions}
      </header>
      <main className="flow-body">{children}</main>
      {footer && <footer className="flow-footer">{footer}</footer>}
    </div>
  );
}
