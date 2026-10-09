import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { globalMotionDurationMs } from "./timing";

/** Capture painted positions so a second removal can interrupt the first smoothly. */
export function useListReflowMotion(ref: RefObject<HTMLElement | null>, keys: string, reducedMotion: boolean) {
  const before = useRef<Map<string, DOMRect> | null>(null);
  const animations = useRef<Animation[]>([]);
  const cancel = useCallback(() => {
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
  }, []);
  const prepare = useCallback(() => {
    before.current = reducedMotion ? null : new Map(
      [...(ref.current?.querySelectorAll<HTMLElement>("[data-layout-key]") ?? [])]
        .map((element) => [element.dataset.layoutKey!, element.getBoundingClientRect()])
    );
  }, [reducedMotion, ref]);

  useLayoutEffect(() => {
    const snapshot = before.current;
    before.current = null;
    if (reducedMotion) { cancel(); return; }
    if (!snapshot || !ref.current) return;
    cancel();
    const easing = getComputedStyle(ref.current).getPropertyValue("--motion-ease-global-enter").trim();
    for (const element of ref.current.querySelectorAll<HTMLElement>("[data-layout-key]")) {
      const previous = snapshot.get(element.dataset.layoutKey!);
      if (!previous) continue;
      const current = element.getBoundingClientRect();
      const dx = previous.x - current.x;
      const dy = previous.y - current.y;
      if (Math.abs(dx) < .5 && Math.abs(dy) < .5) continue;
      animations.current.push(element.animate([
        { transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }
      ], { duration: globalMotionDurationMs, easing }));
    }
  }, [cancel, keys, reducedMotion, ref]);

  useLayoutEffect(() => {
    window.addEventListener("resize", cancel);
    return () => { window.removeEventListener("resize", cancel); cancel(); };
  }, [cancel]);
  return prepare;
}
