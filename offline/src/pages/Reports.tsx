import { Link } from "react-router-dom";
import { REPORTS } from "@/logic/reports";
import { Card, PageHeader } from "@/components/ui";

export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Relatórios"
        subtitle="Com filtro de período e envio em PDF pelo WhatsApp" />

      <Card pad={false}>
        {REPORTS.map((report) => (
          <Link key={report.id} to={`/relatorios/${report.id}`} className="block active:bg-ink-50">
            <div className="row">
              <span className="w-7 shrink-0 text-center text-lg" aria-hidden>{report.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink-900">{report.title}</p>
                <p className="text-sm text-ink-500">{report.description}</p>
              </div>
              <span className="shrink-0 text-ink-400">›</span>
            </div>
          </Link>
        ))}
      </Card>

      <p className="mt-4 px-1 text-sm text-ink-500">
        Todo relatório pode ser gerado em PDF e enviado pelo WhatsApp — útil para
        mandar ao contador ou guardar junto com a documentação do mês.
      </p>
    </div>
  );
}
