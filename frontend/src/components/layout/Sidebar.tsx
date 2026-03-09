import { NavLink } from "react-router-dom";
import {
  ChartBarIcon,
  UsersIcon,
  CurrencyDollarIcon,
  BoltIcon,
  ArrowRightStartOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { to: "/overview", label: "Overview", icon: ChartBarIcon },
  { to: "/usage", label: "Usage & Adoption", icon: UsersIcon },
  { to: "/cost", label: "Cost & Efficiency", icon: CurrencyDollarIcon },
  { to: "/performance", label: "Performance", icon: BoltIcon },
];

export function Sidebar() {
  const { org, user, logout } = useAuth();

  return (
    <aside className="flex h-screen w-64 flex-col bg-gray-900 text-gray-100">
      {/* Logo / Org */}
      <div className="flex items-center gap-3 border-b border-gray-700 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold">
          {org?.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{org?.name}</p>
          <p className="text-xs text-gray-400 capitalize">{org?.plan} plan</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              }`
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-gray-700 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 text-xs font-medium">
            {user?.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            <ArrowRightStartOnRectangleIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
