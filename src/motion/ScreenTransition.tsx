import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Screen } from "../types/app";
import { motionPresenceMaxMs } from "./useMotionPresence";

type ScreenMotionState = "entering" | "idle";

type ScreenTransitionSnapshot = {
  nonce: number;
  state: ScreenMotionState;
};

export type ScreenTransitionProps = {
  screenKey: Screen;
  direction: "forward" | "back" | "replace";
  nonce: number;
  initial: boolean;
  reducedMotion: boolean;
  children: ReactNode;
};

export const screenTransitionAnimationNames = [
  "motion-screen-phone-forward-in",
  "motion-screen-phone-back-in",
  "motion-screen-replace-in",
  "motion-screen-tablet-in",
  "motion-screen-short-forward-in",
  "motion-screen-short-back-in"
] as const;

function settleScreenTransition(
  current: ScreenTransitionSnapshot,
  nonce: number
): ScreenTransitionSnapshot {
  if (current.nonce !== nonce || current.state !== "entering") return current;
  return { ...current, state: "idle" };
}

export function ScreenTransition({
  screenKey,
  direction,
  nonce,
  initial,
  reducedMotion,
  children
}: ScreenTransitionProps) {
  const initialNonceRef = useRef(nonce);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<ScreenTransitionSnapshot>(() => ({
    nonce,
    state: initial || reducedMotion ? "idle" : "entering"
  }));

  const isNewNonce = snapshot.nonce !== nonce;
  const isInitialNonce = initial && nonce === initialNonceRef.current;
  const renderedSnapshot: ScreenTransitionSnapshot = isNewNonce
    ? { nonce, state: reducedMotion || isInitialNonce ? "idle" : "entering" }
    : reducedMotion && snapshot.state === "entering"
      ? { ...snapshot, state: "idle" }
      : snapshot;

  useLayoutEffect(() => {
    setSnapshot((current) => {
      if (current.nonce !== nonce) {
        const isInitialNonceForUpdate = initial && nonce === initialNonceRef.current;
        return { nonce, state: reducedMotion || isInitialNonceForUpdate ? "idle" : "entering" };
      }
      if (reducedMotion && current.state === "entering") return { ...current, state: "idle" };
      return current;
    });
  }, [initial, nonce, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;

    const root = rootRef.current;
    if (!root) return;

    const activeNonce = renderedSnapshot.nonce;
    const settleForCurrentNonce = (event: AnimationEvent) => {
      if (
        event.target !== root
        || !screenTransitionAnimationNames.includes(event.animationName as typeof screenTransitionAnimationNames[number])
      ) {
        return;
      }
      setSnapshot((current) => settleScreenTransition(current, activeNonce));
    };

    root.addEventListener("animationend", settleForCurrentNonce);
    root.addEventListener("animationcancel", settleForCurrentNonce);
    return () => {
      root.removeEventListener("animationend", settleForCurrentNonce);
      root.removeEventListener("animationcancel", settleForCurrentNonce);
    };
  }, [reducedMotion, renderedSnapshot.nonce]);

  useEffect(() => {
    if (reducedMotion || renderedSnapshot.state !== "entering") return;

    const activeNonce = renderedSnapshot.nonce;
    const fallback = window.setTimeout(() => {
      setSnapshot((current) => settleScreenTransition(current, activeNonce));
    }, motionPresenceMaxMs);

    return () => window.clearTimeout(fallback);
  }, [reducedMotion, renderedSnapshot.nonce, renderedSnapshot.state]);

  return (
    <div
      key={renderedSnapshot.nonce}
      ref={rootRef}
      className="motion-screen-transition"
      data-motion-direction={direction}
      data-motion-nonce={renderedSnapshot.nonce}
      data-motion-state={renderedSnapshot.state}
      data-screen={screenKey}
    >
      {children}
    </div>
  );
}
