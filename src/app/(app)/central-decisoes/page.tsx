import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getInsights } from "@/server/services/decisions";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const STYLES = {
  danger: { card: "border-l-4 border-red-500 bg-red-50", label: "Urgente", chip: "bg-red-600 text-white" },
  warning: { card: "border-l-4 border-banana-500 bg-banana-50", label: "Atenção", chip: "bg-banana-500 text-[#3A2C00]" },
  success: { card: "border-l-4 border-leaf-500 bg-leaf-50", label: "Oportunidade", chip: "bg-leaf-600 text-white" },
  info: { card: "border-l-4 border-sky-400 bg-sky-50", label: "Informação", chip: "bg-sky-500 text-white" },
} as const;

const ORDER = ["danger", "warning", "success", "info"] as const;

/** CENTRAL DE DECISÕES 🍌 — recomendações calculadas sobre os dados reais do ERP. */
export default async function DecisionsPage() {
  const user = (await getCurrentUser())!;
  const insights = await getInsights(user.companyId);

  const groups = ORDER.map((level) => ({
    level,
    items: insights.filter((i) => i.level === level),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <PageHeader
        title="Central de Decisões 🍌"
        subtitle="O que os números da sua operação estão dizendo agora"
      />

      {insights.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Nada exige sua atenção agora"
          detail="Conforme você registrar vendas, compras e produções, as recomendações aparecem aqui automaticamente."
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => {
            const style = STYLES[group.level];
            return (
              <section key={group.level}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style.chip}`}>{style.label}</span>
                  <span className="text-xs font-semibold text-ink-500">{group.items.length}</span>
                </div>
                <div className="space-y-2">
                  {group.items.map((insight) => (
                    <div key={insight.id} className={`rounded-xl px-4 py-3.5 ${style.card}`}>
                      <div className="flex gap-3">
                        <span className="text-xl leading-none" aria-hidden>{insight.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-ink-900">{insight.title}</p>
                          <p className="mt-1 text-sm leading-snug text-ink-700">{insight.detail}</p>
                          {insight.action && (
                            <Link
                              href={insight.action.href}
                              className="mt-2.5 inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-sm font-bold text-ink-800 shadow-card active:scale-[.98]"
                            >
                              {insight.action.label} →
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Card className="mt-6 bg-ink-50">
        <p className="text-xs leading-relaxed text-ink-600">
          <strong>Como as recomendações são calculadas:</strong> comparamos o estoque com o
          mínimo cadastrado e com a média de vendas e consumo dos últimos 30 dias; o preço de
          compra dos insumos dos últimos 30 dias com os 90 anteriores; as vendas de cada produto
          nos últimos 30 dias com os 30 anteriores; e o rendimento de cada produção com a média
          das últimas. Ajuste os parâmetros em{" "}
          <Link href="/configuracoes" className="font-semibold text-leaf-700 underline">Configurações</Link>.
        </p>
      </Card>
    </div>
  );
}
