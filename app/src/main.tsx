import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./renderer/styles/theme-blue.css";
import "./renderer/styles/theme-pink.css";
import "./renderer/styles/app.css";
import { registerComputedStyleCheck } from "./renderer/debug/checkComputedStyles";
import { loadTheme } from "./theme/themeManager";

if (typeof document !== "undefined") {
  loadTheme();
}

registerComputedStyleCheck();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
