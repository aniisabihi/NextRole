import { NavLink } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm ${isActive ? "font-semibold text-neutral-900" : "text-neutral-600 underline"}`;

export function AppNav() {
  return (
    <nav className="flex gap-4 border-b border-neutral-200 pb-3">
      <NavLink className={linkClass} to="/dashboard">
        Dashboard
      </NavLink>
      <NavLink className={linkClass} to="/applications">
        Applications
      </NavLink>
    </nav>
  );
}
