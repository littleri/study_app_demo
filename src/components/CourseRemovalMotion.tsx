import { useLayoutEffect, useRef, type ReactNode } from "react";

export function CourseRemovalMotion({ id, exiting, reducedMotion, onExit, children }: {
  id: string;
  exiting: boolean;
  reducedMotion: boolean;
  onExit: (id: string) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!exiting || !element) return;
    if (reducedMotion) { onExit(id); return; }
    const style = getComputedStyle(element);
    const animation = element.animate([
      { opacity: 1, transform: "translateY(0px)" }, { opacity: 0, transform: "translateY(-6px)" }
    ], {
      duration: Number.parseFloat(style.getPropertyValue("--motion-duration-local-fast")),
      easing: style.getPropertyValue("--motion-ease-local-exit").trim(),
      fill: "forwards"
    });
    let active = true;
    void animation.finished.then(() => { if (active) onExit(id); }).catch(() => {});
    return () => { active = false; animation.cancel(); };
  }, [exiting, id, onExit, reducedMotion]);
  return <div ref={ref} className="course-library-row-content" inert={exiting || undefined} aria-hidden={exiting || undefined} data-course-removal={exiting ? "exiting" : "idle"}>{children}</div>;
}
