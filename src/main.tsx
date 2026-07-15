import "@fontsource-variable/archivo";
import "@fontsource/tomorrow/400.css";
import "@fontsource/tomorrow/600.css";
import "@fontsource/tomorrow/700.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
