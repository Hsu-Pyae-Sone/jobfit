"use client";

import AppBar from "@mui/material/AppBar";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { NAV } from "@/lib/modules";
import { useAccount } from "./account/AccountProvider";
import { cx } from "./ui";

const SIDEBAR_WIDTH = 256;

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Jobfit home">
      <span className="grid size-8 place-items-center rounded-lg bg-ink text-[13px] font-bold tracking-tight text-white">JF</span>
      <span className="font-display text-[19px] font-semibold tracking-tight text-ink">
        Job<span className="text-brand">fit</span>
      </span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main">
      <List dense disablePadding className="space-y-0.5">
        {NAV.map((item) => {
          const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
          const Icon = item.icon;
          return (
            <ListItemButton
              key={item.href}
              component={Link}
              href={item.href}
              onClick={onNavigate}
              selected={active}
              aria-current={active ? "page" : undefined}
              sx={{
                py: 1,
                color: "var(--ink-2)",
                "&.Mui-selected": { bgcolor: "var(--ink)", color: "#fff", "& .MuiListItemIcon-root": { color: "#fff" } },
                "&.Mui-selected:hover": { bgcolor: "var(--ink-2)" },
              }}
            >
              <ListItemIcon sx={{ minWidth: 34, color: "inherit" }}>
                <Icon className="size-[18px]" aria-hidden />
              </ListItemIcon>
              <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontSize: 14, fontWeight: active ? 600 : 500 } } }} />
            </ListItemButton>
          );
        })}
      </List>
    </nav>
  );
}

/** Signed-in account, AI status and account links at the bottom of the sidebar. */
export function AccountPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { me } = useAccount();
  if (!me) return null;
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-muted">
      <div className="truncate font-medium text-ink" title={me.user.email}>
        {me.mode === "local" ? "Local mode (this computer)" : me.user.displayName || me.user.email}
      </div>
      <Link href="/settings" onClick={onNavigate} className="block hover:text-ink">
        <span className={cx("mr-1.5 inline-block size-2 rounded-full", me.aiConfigured ? "bg-add-ink" : "bg-accent")} aria-hidden />
        {!me.aiConfigured ? "AI not configured" : me.aiConsentAt ? "AI on" : "AI needs your permission"}
      </Link>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {me.user.isAdmin && me.mode === "supabase" && (
          <Link href="/admin" onClick={onNavigate} className="inline-flex items-center gap-1 text-brand hover:underline">
            <ShieldCheck className="size-3.5" aria-hidden /> Admin
          </Link>
        )}
        {me.mode === "supabase" && (
          <form action="/auth/signout" method="post">
            <button type="submit" className="inline-flex items-center gap-1 text-brand hover:underline">
              <LogOut className="size-3.5" aria-hidden /> Sign out
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col px-3 py-5">
      <div className="px-2">
        <Logo />
      </div>
      <div className="mt-7 flex-1 overflow-y-auto">
        <NavList onNavigate={onNavigate} />
      </div>
      <AccountPanel onNavigate={onNavigate} />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const current = NAV.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)));

  return (
    <div className="flex min-h-dvh">
      {/* Desktop: permanent left sidebar */}
      <Drawer
        variant="permanent"
        className="hidden lg:block"
        sx={{ width: SIDEBAR_WIDTH, flexShrink: 0, "& .MuiDrawer-paper": { width: SIDEBAR_WIDTH, bgcolor: "var(--paper)", borderColor: "var(--line)" } }}
      >
        <SidebarContent />
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Tablet & mobile: app bar + slide-out navigation */}
        <AppBar position="sticky" color="inherit" elevation={0} className="lg:!hidden" sx={{ bgcolor: "rgba(246,244,239,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--line)" }}>
          <Toolbar sx={{ gap: 1, minHeight: { xs: 56 } }}>
            <IconButton edge="start" onClick={() => setOpen(true)} aria-label="Open navigation">
              <Menu className="size-5" />
            </IconButton>
            <Logo />
            {current && <span className="ml-auto truncate text-sm text-muted">{current.label}</span>}
          </Toolbar>
        </AppBar>
        <Drawer open={open} onClose={() => setOpen(false)} className="lg:hidden" sx={{ "& .MuiDrawer-paper": { width: 288, bgcolor: "var(--paper)" } }}>
          <div className="flex justify-end px-2 pt-2">
            <IconButton onClick={() => setOpen(false)} aria-label="Close navigation">
              <X className="size-5" />
            </IconButton>
          </div>
          <div className="-mt-8 flex-1">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </Drawer>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
