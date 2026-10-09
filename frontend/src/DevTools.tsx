import { Agentation } from "agentation";
import { createRoot } from "react-dom/client";

export function mountDevTools() {
  const host = document.createElement("div");
  host.id = "agentation-root";
  document.body.append(host);
  createRoot(host).render(<Agentation />);
}
