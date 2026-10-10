import { useUpdateAvailable } from "../../queries/version.queries";

/** Asks rather than reloads, since a reload would drop whatever is half-logged. */
export function UpdateBar() {
  if (!useUpdateAvailable()) return null;
  return (
    <div className="update-bar">
      <button onClick={() => location.reload()}>
        Dash was updated · <b>Tap to reload</b>
      </button>
    </div>
  );
}
