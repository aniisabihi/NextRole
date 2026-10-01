import { NavLink } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 ${isActive ? "font-semibold text-neutral-900" : "text-neutral-600 underline"}`;

export function AppNav() {
  return (
    <nav
      aria-label="Main"
      className="flex gap-4 border-b border-neutral-200 pb-3"
    >
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
