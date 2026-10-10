import { createRoot } from "react-dom/client";
import "../capture/styles.css";

const params = new URLSearchParams(location.search);
const returnTo = params.get("returnTo") ?? "/capture/";
// Only a path on this site, so the link can't be used to send someone elsewhere after signing in.
const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/capture/";
const error = params.get("error");

function Login() {
  return (
    <div className="flow">
      <main className="flow-body center-page">
        <h1 className="drawer-brand">Dash</h1>
        {error && <p className="notice">Signing in didn't work{error === "oauth_error" || error === "unknown_error" ? "" : `: ${error}`}. Try again.</p>}
        <a className="btn btn-primary" href={`/auth/google/authorize?returnTo=${encodeURIComponent(safeReturnTo)}`}>
          Sign in with Google
        </a>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Login />);
