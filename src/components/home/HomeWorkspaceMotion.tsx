import { useLayoutEffect, useRef, type ReactNode } from "react";
import { globalMotionDurationMs, localMotionMaxMs, useReducedMotion } from "../../motion";

/** Keep one live workspace: stale course actions never survive in an exit layer. */
export function HomeWorkspaceMotion({ transitionKey, pending, children }: {
  transitionKey: string;
  pending: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef<{ height: number; width: number } | null>(null);
  const readyHeight = useRef(0);
  const animations = useRef<Animation[]>([]);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const shell = ref.current;
    const content = shell?.firstElementChild as HTMLElement | null;
    if (!shell || !content) return;
    const before = previous.current;
    const paintedHeight = animations.current.length ? shell.getBoundingClientRect().height : before?.height;
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
    // The placeholder reserves the last workspace's footprint while resources load.
    const sameWidth = !before || Math.abs(before.width - content.getBoundingClientRect().width) <= 1;
    content.style.minHeight = pending && readyHeight.current && sameWidth ? `${readyHeight.current}px` : "";
    const bounds = content.getBoundingClientRect();
    shell.style.backgroundColor = getComputedStyle(content).backgroundColor;
    previous.current = { height: bounds.height, width: bounds.width };
    if (!pending) readyHeight.current = bounds.height;
    shell.dataset.workspaceMotion = "idle";
    if (!before || reducedMotion || Math.abs(before.width - bounds.width) > 1) return;

    const style = getComputedStyle(shell);
    if (paintedHeight !== undefined && Math.abs(paintedHeight - bounds.height) > 1) {
      animations.current.push(shell.animate([
        { height: `${paintedHeight}px` }, { height: `${bounds.height}px` }
      ], { duration: globalMotionDurationMs, easing: style.getPropertyValue("--motion-ease-local-state").trim() }));
    }
    if (!pending) {
      animations.current.push(content.animate([
        { opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0px)" }
      ], { duration: localMotionMaxMs, easing: style.getPropertyValue("--motion-ease-local-enter").trim() }));
    }
    if (!animations.current.length) return;
    shell.dataset.workspaceMotion = "transitioning";
    const active = animations.current;
    void Promise.all(active.map((animation) => animation.finished)).then(() => {
      if (animations.current !== active) return;
      animations.current = [];
      shell.dataset.workspaceMotion = "idle";
    }).catch(() => { /* A newer selection owns the live workspace. */ });
  }, [pending, reducedMotion, transitionKey]);

  useLayoutEffect(() => {
    const shell = ref.current;
    if (!shell) return;
    const observer = new ResizeObserver(() => {
      const content = shell.firstElementChild as HTMLElement | null;
      if (!content) return;
      let bounds = content.getBoundingClientRect();
      if (previous.current && Math.abs(previous.current.width - bounds.width) > 1) {
        animations.current.forEach((animation) => animation.cancel());
        animations.current = [];
        shell.dataset.workspaceMotion = "idle";
        content.style.minHeight = "";
        bounds = content.getBoundingClientRect();
      }
      previous.current = { height: bounds.height, width: bounds.width };
      if (!content.classList.contains("is-loading")) readyHeight.current = bounds.height;
    });
    observer.observe(shell);
    return () => {
      observer.disconnect();
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
    };
  }, []);

  return <div ref={ref} className="home-workspace-transition" data-workspace-motion="idle">{children}</div>;
}
