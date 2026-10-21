import type { CSSProperties } from "react";

const blurRadii = [1, 2, 4, 8, 16, 24] as const;

/** A stable decorative sibling of the page, kept below navigation and dialogs. */
export function BottomNavigationBlur({ visible }: { visible: boolean }) {
  return (
    <div className="bottom-navigation-blur" hidden={!visible} aria-hidden="true">
      {blurRadii.map((radius) => (
        <span
          className="bottom-navigation-blur-layer"
          key={radius}
          style={{ "--bottom-navigation-blur-radius": `${radius}px` } as CSSProperties}
        />
      ))}
    </div>
  );
}
