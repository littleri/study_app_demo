import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MotionHistoryProvider } from "./motion/MotionHistoryContext";
import { DevicePreviewStudio } from "./preview/DevicePreviewStudio";
import "./styles/tokens.css";
import "./styles/glass.css";
import "./styles/base.css";
import "./styles/responsive.css";
import "./styles/home.css";
import "./styles/study.css";
import "./styles/motion.css";
import "./styles/device-preview.css";
import "./styles/card-system.css";

const searchParams = new URLSearchParams(window.location.search);
const isEmbeddedPreview = searchParams.get("embedded") === "device-preview";
const Root = isEmbeddedPreview ? App : DevicePreviewStudio;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <MotionHistoryProvider>
        <Root />
      </MotionHistoryProvider>
    </ErrorBoundary>
  </StrictMode>
);
