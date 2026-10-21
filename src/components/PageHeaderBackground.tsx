import type { CSSProperties } from "react";
import type { Screen } from "../types/app";

const progressiveHeaderScreens = new Set<Screen>([
  "home", "courseDetail", "library", "plan",
  "flashcards", "diagnosis", "notes", "voiceNote", "export", "profile", "settings"
]);
const blurRadii = [1, 2, 4, 8, 12, 16] as const;

function BlurLayers() {
  return blurRadii.map((radius) => (
    <span
      className="page-header-blur-layer"
      key={radius}
      style={{ "--page-header-blur-radius": `${radius}px` } as CSSProperties}
    />
  ));
}

/** Lives behind a sticky control group, whose natural height sets the blur edge. */
export function StickyControlsBackground() {
  return <div className="sticky-controls-background" aria-hidden="true"><BlurLayers /></div>;
}

/** Owns the header surface; text and controls remain in a separate clear layer. */
export function PageHeaderBackground({ screen, visible }: { screen: Screen; visible: boolean }) {
  return (
    <div
      className="page-header-background"
      data-material={progressiveHeaderScreens.has(screen) ? "progressive" : "solid"}
      hidden={!visible}
      aria-hidden="true"
    >
      <BlurLayers />
    </div>
  );
}
