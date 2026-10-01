import { NavLink } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
    isActive
      ? "bg-accent-soft text-accent-hover"
      : "text-ink-muted hover:bg-paper hover:text-ink"
  }`;

export function AppNav() {
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1">
      <NavLink className={linkClass} to="/dashboard">
        Dashboard
      </NavLink>
      <NavLink className={linkClass} to="/applications">
        Applications
      </NavLink>
      <NavLink className={linkClass} to="/board">
        Board
      </NavLink>
    </nav>
  );
}
