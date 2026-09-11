import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { seedIfEmpty } from "./logic/seed";
import { backupStatus, type BackupStatus } from "./logic/backup";

import DashboardPage from "./pages/Dashboard";
import ProductsPage from "./pages/Products";
import ProductEditPage from "./pages/ProductEdit";
import StockPage from "./pages/Stock";
import StockMovePage from "./pages/StockMove";
import BatchesPage from "./pages/Batches";
import MovementsPage from "./pages/Movements";
import RecipesPage from "./pages/Recipes";
import RecipeEditPage from "./pages/RecipeEdit";
import ProductionPage from "./pages/Production";
import ProductionNewPage from "./pages/ProductionNew";
import ProductionDetailPage from "./pages/ProductionDetail";
import SalesPage from "./pages/Sales";
import SaleNewPage from "./pages/SaleNew";
import SaleDetailPage from "./pages/SaleDetail";
import CustomersPage from "./pages/Customers";
import CustomerEditPage from "./pages/CustomerEdit";
import FinancePage from "./pages/Finance";
import FinanceListPage from "./pages/FinanceList";
import FinanceNewPage from "./pages/FinanceNew";
import DecisionsPage from "./pages/Decisions";
import PricingPage from "./pages/Pricing";
import BackupPage from "./pages/Backup";
import SettingsPage from "./pages/Settings";
import MorePage from "./pages/More";

const TABS = [
  { to: "/", label: "Início", icon: "🏠", end: true },
  { to: "/vendas", label: "Vendas", icon: "🛒" },
  { to: "/producao", label: "Produção", icon: "🏭" },
  { to: "/estoque", label: "Estoque", icon: "📦" },
  { to: "/financeiro", label: "Financeiro", icon: "💰" },
  { to: "/mais", label: "Mais", icon: "☰" },
];

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    seedIfEmpty()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <p className="text-4xl" aria-hidden>⚠️</p>
        <h1 className="mt-3 text-lg font-bold text-ink-900">Não foi possível abrir o banco local</h1>
        <p className="mt-2 text-sm text-ink-600">{error}</p>
        <p className="mt-4 text-xs text-ink-500">
          Se o problema continuar, feche e abra o aplicativo novamente.
        </p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-ink-500">Abrindo o sistema…</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <TopBar />
      <BackupReminder />
      <main className="mx-auto max-w-3xl px-4 py-4 pb-safe md:pb-10">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/produtos" element={<ProductsPage />} />
          <Route path="/produtos/novo" element={<ProductEditPage />} />
          <Route path="/produtos/:id" element={<ProductEditPage />} />
          <Route path="/estoque" element={<StockPage />} />
          <Route path="/estoque/entrada" element={<StockMovePage mode="entrada" />} />
          <Route path="/estoque/saida" element={<StockMovePage mode="saida" />} />
          <Route path="/estoque/ajuste" element={<StockMovePage mode="ajuste" />} />
          <Route path="/estoque/lotes" element={<BatchesPage />} />
          <Route path="/estoque/movimentos" element={<MovementsPage />} />
          <Route path="/fichas-tecnicas" element={<RecipesPage />} />
          <Route path="/fichas-tecnicas/nova" element={<RecipeEditPage />} />
          <Route path="/fichas-tecnicas/:id" element={<RecipeEditPage />} />
          <Route path="/producao" element={<ProductionPage />} />
          <Route path="/producao/nova" element={<ProductionNewPage />} />
          <Route path="/producao/:id" element={<ProductionDetailPage />} />
          <Route path="/vendas" element={<SalesPage />} />
          <Route path="/vendas/nova" element={<SaleNewPage />} />
          <Route path="/vendas/:id" element={<SaleDetailPage />} />
          <Route path="/clientes" element={<CustomersPage />} />
          <Route path="/clientes/novo" element={<CustomerEditPage />} />
          <Route path="/clientes/:id" element={<CustomerEditPage />} />
          <Route path="/financeiro" element={<FinancePage />} />
          <Route path="/financeiro/pagar" element={<FinanceListPage direction="PAYABLE" />} />
          <Route path="/financeiro/receber" element={<FinanceListPage direction="RECEIVABLE" />} />
          <Route path="/financeiro/novo" element={<FinanceNewPage />} />
          <Route path="/central-decisoes" element={<DecisionsPage />} />
          <Route path="/precificacao" element={<PricingPage />} />
          <Route path="/backup" element={<BackupPage />} />
          <Route path="/configuracoes" element={<SettingsPage />} />
          <Route path="/mais" element={<MorePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2 font-bold text-ink-900">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-banana-400 text-lg" aria-hidden>🍌</span>
          <span className="text-[0.95rem] leading-tight">
            Loja da Banana
            <span className="block text-[0.7rem] font-medium text-ink-500">Neste aparelho</span>
          </span>
        </Link>
        <Link to="/backup" className="ml-auto rounded-lg px-3 py-2 text-sm font-semibold text-leaf-700 hover:bg-leaf-50">
          Backup
        </Link>
      </div>
    </header>
  );
}

function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-white/95 backdrop-blur bottom-safe"
      aria-label="Navegação principal"
    >
      <div className="mx-auto flex max-w-3xl">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className="tabbar-link"
            style={undefined}
          >
            {({ isActive }) => (
              <span className="contents" data-active={isActive}>
                <span className={`text-xl leading-none ${isActive ? "" : "opacity-70"}`} aria-hidden>{tab.icon}</span>
                <span className={isActive ? "text-[var(--leaf)]" : ""}>{tab.label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Aviso discreto quando o backup está atrasado. */
function BackupReminder() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const location = useLocation();

  useEffect(() => {
    backupStatus().then(setStatus).catch(() => setStatus(null));
  }, [location.pathname]);

  if (!status?.overdue || location.pathname === "/backup") return null;

  return (
    <Link to="/backup" className="block bg-banana-100 px-4 py-2.5 text-center text-sm font-semibold text-banana-900">
      {status.last
        ? `Último backup há ${status.daysSince} dias — toque para fazer agora`
        : "Você ainda não fez nenhum backup — toque para proteger seus dados"}
    </Link>
  );
}

function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-4xl" aria-hidden>🤔</p>
      <p className="mt-2 font-semibold text-ink-800">Página não encontrada</p>
      <Link to="/" className="btn-primary btn-sm mt-4 inline-flex">Voltar ao início</Link>
    </div>
  );
}
