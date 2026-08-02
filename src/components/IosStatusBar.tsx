import { Wifi } from "lucide-react";

type IosStatusBarProps = {
  style?: "dark" | "light";
};

/**
 * A non-interactive iPhone status-bar simulation for the mobile demo shell.
 * The values stay deterministic so screenshots and walkthroughs remain stable.
 */
export function IosStatusBar({ style = "dark" }: IosStatusBarProps) {
  return (
    <div
      className="ios-status-bar"
      data-status-bar-style={style}
      data-testid="ios-status-bar"
      aria-hidden="true"
    >
      <span className="ios-status-bar__time">9:41</span>
      <span className="ios-status-bar__indicators">
        <span className="ios-status-bar__signal">
          <span className="ios-status-bar__signal-bar" />
          <span className="ios-status-bar__signal-bar" />
          <span className="ios-status-bar__signal-bar" />
          <span className="ios-status-bar__signal-bar" />
        </span>
        <Wifi className="ios-status-bar__wifi" size={16} strokeWidth={2.4} />
        <span className="ios-status-bar__battery">
          <span className="ios-status-bar__battery-level" />
        </span>
      </span>
    </div>
  );
}
