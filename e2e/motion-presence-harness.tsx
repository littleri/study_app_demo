import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useMotionPresence } from "../src/motion/useMotionPresence";

type Surface = {
  key: string;
  value: number;
};

type MotionPresenceHarness = {
  replace: (key: string, value: number) => void;
  setReducedMotion: (reducedMotion: boolean) => void;
  unmount: () => void;
  updateSameKey: (value: number) => void;
};

declare global {
  interface Window {
    __motionPresenceHarness?: MotionPresenceHarness;
  }
}

const rootElement = document.getElementById("motion-presence-root");

if (!rootElement) {
  throw new Error("Motion presence harness root is missing.");
}

const root = createRoot(rootElement);
const getSurfaceKey = (surface: Surface) => surface.key;
const motionNames = ["motion-presence-harness"] as const;

function MotionPresenceHarnessView() {
  const [requested, setRequested] = useState<Surface | null>({ key: "alpha", value: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const presence = useMotionPresence({
    requested,
    getKey: getSurfaceKey,
    reducedMotion,
    motionNames
  });

  useEffect(() => {
    window.__motionPresenceHarness = {
      replace: (key, value) => setRequested({ key, value }),
      setReducedMotion,
      unmount: () => root.unmount(),
      updateSameKey: (value) => setRequested({ key: "alpha", value })
    };

    return () => {
      delete window.__motionPresenceHarness;
    };
  }, []);

  return (
    <output
      id="motion-presence-state"
      data-presence-id={presence.presenceId}
      data-rendered-key={presence.rendered?.key ?? "none"}
      data-rendered-value={presence.rendered?.value ?? "none"}
      data-requested-key={requested?.key ?? "none"}
      data-requested-value={requested?.value ?? "none"}
      data-state={presence.state}
    />
  );
}

root.render(<MotionPresenceHarnessView />);
