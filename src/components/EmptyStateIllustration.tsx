const sources = {
  courses: "no-courses-v1.png",
  notes: "no-notes-v1.png",
  search: "no-results-v1.png",
  connection: "connection-error-v1.png"
} as const;

/** Decorative artwork; the adjacent heading and actions describe each state. */
export function EmptyStateIllustration({ scene }: { scene: keyof typeof sources }) {
  return (
    <img
      className="empty-state-illustration"
      data-empty-illustration={scene}
      src={`/assets/brand/empty-states/${sources[scene]}`}
      width={1254}
      height={1254}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
    />
  );
}
