import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { datetime } from "@/lib/format";
import { Card, PageHeader, SectionTitle } from "@/components/ui";

const MENU = [
  {
    group: "Cadastros",
    items: [
      { to: "/produtos", icon: "🍌", label: "Produtos e insumos" },
      { to: "/clientes", icon: "👥", label: "Clientes" },
    ],
  },
  {
    group: "Operação",
    items: [
      { to: "/fichas-tecnicas", icon: "📐", label: "Fichas técnicas" },
      { to: "/estoque/lotes", icon: "🏷️", label: "Lotes e validade" },
      { to: "/estoque/movimentos", icon: "🔁", label: "Movimentações" },
    ],
  },
  {
    group: "Gestão",
    items: [
      { to: "/central-decisoes", icon: "🧠", label: "Central de Decisões" },
      { to: "/precificacao", icon: "🏷️", label: "Formação de preço" },
    ],
  },
  {
    group: "Aplicativo",
    items: [
      { to: "/backup", icon: "💾", label: "Backup e restauração" },
      { to: "/configuracoes", icon: "⚙️", label: "Configurações" },
    ],
  },
];

export default function MorePage() {
  const logs = useLiveQuery(
    async () => db.logs.orderBy("createdAt").reverse().limit(30).toArray(),
    [],
  );

  return (
    <div>
      <PageHeader title="Mais" subtitle="Tudo o que não cabe no menu de baixo" />

      {MENU.map((section) => (
        <div key={section.group} className="mb-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">
            {section.group}
          </h2>
          <Card pad={false}>
            {section.items.map((item) => (
              <Link key={item.to} to={item.to} className="block active:bg-ink-50">
                <div className="row">
                  <span className="flex items-center gap-3 font-medium text-ink-800">
                    <span className="w-6 text-center text-lg" aria-hidden>{item.icon}</span>
                    {item.label}
                  </span>
                  <span className="text-ink-400">›</span>
                </div>
              </Link>
            ))}
          </Card>
        </div>
      ))}

      <SectionTitle>Últimas operações</SectionTitle>
      {!logs?.length ? (
        <Card><p className="text-sm text-ink-500">Nada registrado ainda.</p></Card>
      ) : (
        <Card pad={false}>
          {logs.map((log) => (
            <div key={log.id} className="border-b border-[var(--border)] px-4 py-3 last:border-0">
              <p className="text-sm font-medium text-ink-800">{log.summary}</p>
              <p className="mt-0.5 text-xs text-ink-500">{log.entity} · {datetime(log.createdAt)}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
