"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

const TABS = [
  { href: "/", label: "Início", icon: "🏠", permission: "dashboard.read", exact: true },
  { href: "/vendas", label: "Vendas", icon: "🛒", permission: "sales.read" },
  { href: "/producao", label: "Produção", icon: "🏭", permission: "production.read" },
  { href: "/estoque", label: "Estoque", icon: "📦", permission: "stock.read" },
  { href: "/financeiro", label: "Financeiro", icon: "💰", permission: "finance.read" },
  { href: "/mais", label: "Mais", icon: "☰", permission: "dashboard.read" },
];

export function BottomNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => can(user.permissions, t.permission));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-white/95 backdrop-blur bottom-safe md:hidden"
      aria-label="Navegação principal"
    >
      <div className="mx-auto flex max-w-3xl">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href} className="tabbar-link" data-active={active}>
              <span className="text-xl leading-none" aria-hidden>{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function TopBar({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const initials = user.name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 font-bold text-ink-900">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-banana-400 text-lg" aria-hidden>🍌</span>
          <span className="hidden text-[0.95rem] leading-tight sm:block">
            Loja da Banana
            <span className="block text-[0.7rem] font-medium text-ink-500">{user.companyName}</span>
          </span>
        </Link>

        <nav className="ml-4 hidden flex-1 items-center gap-1 md:flex" aria-label="Menu">
          {TABS.filter((t) => can(user.permissions, t.permission) && t.href !== "/mais").map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-50 hover:text-ink-900"
            >
              {t.label}
            </Link>
          ))}
          <Link href="/central-decisoes" className="rounded-lg px-3 py-2 text-sm font-semibold text-leaf-700 hover:bg-leaf-50">
            Central de Decisões
          </Link>
          <Link href="/mais" className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-50">
            Mais
          </Link>
        </nav>

        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-ink-50"
            aria-expanded={open}
            aria-haspopup="menu"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-leaf-600 text-sm font-bold text-white">
              {initials}
            </span>
          </button>
          {open && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default"
                aria-label="Fechar menu"
                onClick={() => setOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-lg"
              >
                <div className="border-b border-[var(--border)] px-4 py-3">
                  <p className="truncate font-semibold text-ink-900">{user.name}</p>
                  <p className="truncate text-xs text-ink-500">{user.email}</p>
                  <p className="mt-1 text-xs font-semibold text-leaf-700">{user.roleName}</p>
                </div>
                <Link href="/perfil" onClick={() => setOpen(false)} className="block px-4 py-3 text-sm font-medium hover:bg-ink-50">
                  Minha conta
                </Link>
                {can(user.permissions, "settings.read") && (
                  <Link href="/configuracoes" onClick={() => setOpen(false)} className="block px-4 py-3 text-sm font-medium hover:bg-ink-50">
                    Configurações
                  </Link>
                )}
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="w-full border-t border-[var(--border)] px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50">
                    Sair
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
