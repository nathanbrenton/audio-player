import { hiplingoLogoUrl } from "@hiplingo/brand";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Root element with id="root" was not found');
}

let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');

if (!favicon) {
  favicon = document.createElement("link");
  favicon.rel = "icon";
  document.head.append(favicon);
}

favicon.href = hiplingoLogoUrl;

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
