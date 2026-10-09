import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { hydrate } from "./data/persist";
import "./styles.css";

// Stores read their state when their modules load, so the app is imported only after IndexedDB is read.
hydrate()
  .then(() => import("./App"))
  .then(({ App }) => {
    createRoot(document.getElementById("root")!).render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
  });

if (import.meta.env.DEV) {
  import("./DevTools").then(({ mountDevTools }) => mountDevTools());
}
