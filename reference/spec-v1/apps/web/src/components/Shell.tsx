"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [{ href: "/", label: "Home" }, { href: "/workout", label: "Workout" }];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-28 pt-5">
      {children}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/90 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-md">
          {tabs.map((t) => {
            const on = t.href === "/" ? path === "/" : path.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} className={`flex-1 py-4 text-center text-sm font-semibold ${on ? "text-text" : "text-mute"}`}>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-border bg-surface p-4 ${className}`}>{children}</div>
);
export const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] font-medium uppercase tracking-wider text-dim">{children}</div>
);
