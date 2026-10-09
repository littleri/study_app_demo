import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { globalEmphasisMotionDurationMs } from "./timing";

type ElementSnapshot = {
  element: HTMLElement;
  bounds: DOMRect;
  opacity: string;
};
type SidebarSnapshot = {
  elements: ElementSnapshot[];
  content: HTMLElement | null;
  inset: number;
};

const movingElements = ".nav-rail-surface, .nav-selection, .nav-icon, .nav-brand-mark, .nav-expand-toggle, .nav-label, .nav-brand-name, .nav-study-context";

/** Commit layout once, then animate only transforms and opacity over it. */
export function usePadSidebarMotion({ shellRef, mainRef, expanded, enabled, reducedMotion }: {
  shellRef: RefObject<HTMLDivElement | null>;
  mainRef: RefObject<HTMLElement | null>;
  expanded: boolean;
  enabled: boolean;
  reducedMotion: boolean;
}) {
  const preparedRef = useRef<SidebarSnapshot | null>(null);
  const animationsRef = useRef<Animation[]>([]);
  const generationRef = useRef(0);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    animationsRef.current.forEach((animation) => animation.cancel());
    animationsRef.current = [];
    const shell = shellRef.current;
    if (shell) shell.dataset.sidebarMotion = "idle";
  }, [shellRef]);

  const prepare = useCallback(() => {
    const shell = shellRef.current;
    const main = mainRef.current;
    if (!enabled || reducedMotion || !shell || !main) return;
    // Read the currently painted positions before canceling interrupted motion.
    preparedRef.current = {
      elements: [...shell.querySelectorAll<HTMLElement>(`.primary-nav :is(${movingElements})`)].map((element) => ({
        element,
        bounds: element.getBoundingClientRect(),
        opacity: getComputedStyle(element).opacity
      })),
      content: main.firstElementChild as HTMLElement | null,
      inset: Number.parseFloat(getComputedStyle(main).paddingLeft)
    };
  }, [enabled, mainRef, reducedMotion, shellRef]);

  useLayoutEffect(() => {
    const before = preparedRef.current;
    preparedRef.current = null;
    const content = before?.content;
    // The content may still be translated by a previous, interrupted toggle.
    const previousContentTransform = content ? new DOMMatrixReadOnly(getComputedStyle(content).transform).m41 : 0;
    cancel();
    const shell = shellRef.current;
    const main = mainRef.current;
    if (!before || !enabled || reducedMotion || !shell || !main) return;
    const generation = generationRef.current;
    const shellStyle = getComputedStyle(shell);
    const easing = shellStyle.getPropertyValue("--motion-ease-local-state").trim();
    const enterEasing = shellStyle.getPropertyValue("--motion-ease-local-enter").trim();
    const exitEasing = shellStyle.getPropertyValue("--motion-ease-local-exit").trim();
    const duration = globalEmphasisMotionDurationMs;
    const localDuration = Number.parseFloat(shellStyle.getPropertyValue(expanded ? "--motion-duration-local-base" : "--motion-duration-local-fast"));
    const animate = (element: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      animationsRef.current.push(element.animate(keyframes, options));
    };
    shell.dataset.sidebarMotion = expanded ? "expanding" : "collapsing";
    for (const snapshot of before.elements) {
      const { element, bounds, opacity } = snapshot;
      if (!element.isConnected) continue;
      const next = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const baseTransform = style.transform === "none" ? "" : style.transform;
      const dx = bounds.x - next.x;
      const dy = bounds.y - next.y;
      const isText = element.matches(".nav-label, .nav-brand-name, .nav-study-context");
      if (isText) {
        // Exiting labels keep their painted location while final layout shrinks.
        const from = expanded ? (Number(opacity) > 0 ? dx : -6) : dx;
        const fromY = Number(opacity) > 0 ? dy : 0;
        animate(element, [
          { opacity, visibility: "visible", transform: `translate(${from}px, ${fromY}px) ${baseTransform}` },
          { opacity: expanded ? 1 : 0, visibility: "visible", transform: `translate(${expanded ? 0 : dx - 6}px, ${expanded ? 0 : dy}px) ${baseTransform}` }
        ], { duration: localDuration, delay: expanded && Number(opacity) === 0 ? 100 : 0, easing: expanded ? enterEasing : exitEasing, fill: "backwards" });
      } else {
        const scales = element.matches(".nav-rail-surface, .nav-selection");
        const sx = scales && next.width ? bounds.width / next.width : 1;
        const sy = scales && next.height ? bounds.height / next.height : 1;
        animate(element, [
          { transform: `translate(${dx}px, ${dy}px) ${baseTransform} scale(${sx}, ${sy})`, transformOrigin: "top left" },
          { transform: `${baseTransform || "translate(0px, 0px)"} scale(1, 1)`, transformOrigin: "top left" }
        ], { duration, easing });
      }
    }
    if (content?.isConnected) {
      const nextInset = Number.parseFloat(getComputedStyle(main).paddingLeft);
      animate(content, [
        { transform: `translateX(${before.inset - nextInset + previousContentTransform}px)` },
        { transform: "translateX(0px)" }
      ], { duration, easing });
    }
    void Promise.all(animationsRef.current.map((animation) => animation.finished)).then(() => {
      if (generationRef.current === generation) {
        shell.dataset.sidebarMotion = "idle";
        animationsRef.current = [];
      }
    }).catch(() => { /* A newer toggle or resize owns the next frame. */ });
  }, [cancel, enabled, expanded, mainRef, reducedMotion, shellRef]);

  useLayoutEffect(() => {
    window.addEventListener("resize", cancel);
    return () => {
      window.removeEventListener("resize", cancel);
      cancel();
    };
  }, [cancel]);

  return prepare;
}
