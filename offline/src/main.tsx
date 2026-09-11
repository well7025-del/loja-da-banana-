import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./globals.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Rotas por hash: funcionam igual servidas por HTTP ou de dentro do APK. */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
