import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { REPORTS } from "./_registry";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await getCurrentUser();
  const groups = [...new Set(REPORTS.map((r) => r.group))];

  return (
    <div>
      <PageHeader title="Relatórios" subtitle="Filtre por hoje, semana, mês, ano ou período" />
      {groups.map((group) => (
        <div key={group} className="mb-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">{group}</h2>
          <Card pad={false}>
            {REPORTS.filter((r) => r.group === group).map((report) => (
              <Link key={report.slug} href={`/relatorios/${report.slug}`} className="block active:bg-ink-50">
                <div className="row">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-lg" aria-hidden>{report.icon}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">{report.title}</p>
                      <p className="truncate text-xs text-ink-500">{report.description}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-ink-400">›</span>
                </div>
              </Link>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}
