import type { ReactNode } from "react";

// Rounded silhouettes adapted from Phosphor Icons (Light), copyright 2023.
// MIT license: ./LICENSE.phosphor-icons.txt. Selected details are app artwork.
export type NavigationIconName = "home" | "study" | "community" | "profile";

// On the 256-unit grid, Light outlines were 12 units and details were 10.
const outlineStrokeWidth = 18;
const detailStrokeWidth = 15;
const selectedStrokeScale = 1.5;

const outlines: Record<NavigationIconName, ReactNode> = {
  home: (
    <path d="M58 216h140q18 0 18-18v-69q0-11-8-19l-66-66q-14-14-28 0l-66 66q-8 8-8 19v69q0 18 18 18Z" />
  ),
  study: (
    <path d="M128 232a32 32 0 0 0-32-32H42q-18 0-18-18V74q0-18 18-18h54a32 32 0 0 1 32 32v144a32 32 0 0 1 32-32h54q18 0 18-18V74q0-18-18-18h-54a32 32 0 0 0-32 32" />
  ),
  community: (
    <>
      <circle cx="128" cy="128" r="96" />
      <path className="navigation-icon-needle" d="M160 88q16-8 8 8l-16 32q-8 16-24 24l-32 16q-16 8-8-8l16-32q8-16 24-24Z" />
    </>
  ),
  profile: (
    <>
      <circle className="navigation-icon-head" cx="128" cy="96" r="64" />
      <path d="M32 216c20.51-35.44 56.75-56 96-56s75.49 20.56 96 56" />
    </>
  )
};

const selectedDetails: Record<NavigationIconName, ReactNode> = {
  home: (
    <>
      <path d="M74 200h108q18 0 18-18v-49q0-8-6-14l-56-56q-10-10-20 0l-56 56q-6 6-6 14v49q0 18 18 18Z" fill="currentColor" fillOpacity=".12" stroke="none" />
      <path d="M107 210v-45q0-16 16-16h10q16 0 16 16v45" />
      <rect className="navigation-icon-window" x="114" y="92" width="28" height="28" rx="12" fill="currentColor" stroke="none" />
    </>
  ),
  study: (
    <>
      <path d="M44 66h52a22 22 0 0 1 22 22v117c-6-9-14-14-22-14H44q-10 0-10-10V76q0-10 10-10Z" fill="currentColor" fillOpacity=".12" stroke="none" />
      <path className="navigation-icon-page-lines" pathLength="1" d="M56 112h34M56 151h30M161 143h38M161 174h28" />
      <path className="navigation-icon-bookmark" d="M169 66v35q0 10 8 6l5-3q4-3 8 0l5 3q8 4 8-6V66" fill="currentColor" fillOpacity=".12" />
    </>
  ),
  community: (
    <>
      <path d="M128 49v16M128 191v16M49 128h16M191 128h16" />
      <path className="navigation-icon-needle" d="M146 106.5q9-4.5 4.4 4.4l-8.8 17.2q-4.6 8.9-11.7 1.8l-3.8-3.8q-7.1-7.1 1.8-11.5Z" fill="currentColor" stroke="none" />
    </>
  ),
  profile: (
    <>
      <circle className="navigation-icon-head" cx="128" cy="96" r="54" fill="currentColor" fillOpacity=".12" stroke="none" />
      <path d="M102 174c4 24 48 24 52 0M79 195v24M177 195v24" />
    </>
  )
};

/** One stable silhouette; selection reveals detail without swapping SVG nodes. */
export function NavigationIcon({ name, selected = false, size = 22 }: {
  name: NavigationIconName;
  selected?: boolean;
  size?: number;
}) {
  const strokeScale = selected ? selectedStrokeScale : 1;

  return (
    <svg
      className="navigation-icon"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      data-nav-icon={name}
      data-nav-icon-state={selected ? "selected" : "unselected"}
      aria-hidden="true"
      focusable="false"
    >
      <g
        className="navigation-icon-outline"
        strokeWidth={outlineStrokeWidth * strokeScale}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {outlines[name]}
      </g>
      <g
        className="navigation-icon-details"
        opacity={selected ? 1 : 0}
        fill="none"
        stroke="currentColor"
        strokeWidth={detailStrokeWidth * strokeScale}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {selectedDetails[name]}
      </g>
    </svg>
  );
}
