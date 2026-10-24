import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTelegramWebApp } from "./lib/telegram-webapp";

initTelegramWebApp();

createRoot(document.getElementById("root")!).render(<App />);
