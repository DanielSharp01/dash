import { Component, type ReactNode } from "react";
import { OfflineError } from "../../api/client";

/** The first load failed, so there is nothing to show; a reload is the retry. */
export class LoadError extends Component<{ children: ReactNode }, { error?: unknown }> {
  state: { error?: unknown } = {};

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    if (this.state.error === undefined) return this.props.children;
    return (
      <div className="flow">
        <main className="flow-body center-page">
          <p className="empty">{this.state.error instanceof OfflineError ? "No connection, so Dash can't load." : "Dash couldn't load."}</p>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Try again
          </button>
        </main>
      </div>
    );
  }
}
