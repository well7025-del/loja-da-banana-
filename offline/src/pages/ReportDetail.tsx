import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { DEFAULT_PERIOD, resolvePeriod, type Period } from "@/lib/period";
import { buildReportData, REPORTS, type ReportResult } from "@/logic/reports";
import { buildReport } from "@/logic/documents";
import { shareFile } from "@/logic/bridge";
import {
  Busy, Card, Message, PageHeader, PeriodPicker, Spinner, StatCard,
} from "@/components/ui";

export default function ReportDetailPage() {
  const { id } = useParams();
  const meta = REPORTS.find((report) => report.id === id);

  const [period, setPeriod] = useState<Period>(() => resolvePeriod(DEFAULT_PERIOD));
  const [data, setData] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Período amplo para os relatórios de posição, que olham o agora.
  const effective = useMemo(
    () => (meta?.usesPeriod ? period : resolvePeriod("thisYear")),
    [meta, period],
  );

  useEffect(() => {
    if (!meta) return;
    let cancelled = false;
    setLoading(true);
    buildReportData(meta.id, effective)
      .then((result) => { if (!cancelled) { setData(result); setLoading(false); } })
      .catch((e) => {
        if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [meta, effective]);

  if (!meta) return <p className="py-8 text-center text-sm text-ink-500">Relatório não encontrado.</p>;

  async function enviar() {
    if (!data) return;
    setError(null); setNotice(null); setBusy(true);
    try {
      const { pdf, fileName } = await buildReport(
        data.title,
        meta!.usesPeriod ? effective : null,
        data.sections,
      );
      const result = await shareFile({
        fileName,
        base64: pdf.toBase64(),
        mime: "application/pdf",
        text: `${data.title} — ${meta!.usesPeriod ? effective.label : "posição atual"}`,
        title: data.title,
      });
      if (result.ok) setNotice(result.message); else setError(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={meta.title} subtitle={meta.description} />

      <div className="space-y-4">
        <Message error={error} success={notice} />

        {meta.usesPeriod && <PeriodPicker value={period} onChange={setPeriod} />}

        {loading || !data ? <Spinner label="Apurando…" /> : (
          <>
            {data.kpis.length > 0 && (
              <div className="grid grid-cols-2 gap-2.5">
                {data.kpis.map((kpi) => (
                  <StatCard key={kpi.label} label={kpi.label} value={kpi.value}
                    tone={kpi.tone ?? "neutral"} />
                ))}
              </div>
            )}

            {data.sections.map((section, index) => (
              <Card key={index} pad={false} className="overflow-hidden">
                {section.title && (
                  <div className="border-b border-[var(--border)] bg-ink-50 px-4 py-2.5">
                    <h2 className="text-sm font-bold text-ink-800">{section.title}</h2>
                    {section.note && <p className="mt-0.5 text-xs text-ink-500">{section.note}</p>}
                  </div>
                )}

                {section.pairs?.map(([label, value]) => (
                  <div key={label} className="row">
                    <span className="text-ink-600">{label}</span>
                    <span className="font-semibold tabular-nums text-ink-900">{value}</span>
                  </div>
                ))}

                {section.columns && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          {section.columns.map((column) => (
                            <th key={column.title}
                              className={`whitespace-nowrap px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink-500 ${
                                column.align === "right" ? "text-right" : "text-left"
                              }`}>
                              {column.title}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(section.rows ?? []).map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-b border-[var(--border)] last:border-0">
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex}
                                className={`px-3 py-2 text-ink-800 ${
                                  section.columns?.[cellIndex]?.align === "right"
                                    ? "text-right tabular-nums" : ""
                                } ${cell === "NÃO" ? "font-bold text-red-600" : ""}`}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {!section.rows?.length && (
                          <tr>
                            <td colSpan={section.columns.length}
                              className="px-3 py-6 text-center text-ink-500">
                              Nada no período.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {section.totals?.map(([label, value]) => (
                  <div key={label} className="row bg-ink-50">
                    <span className="font-bold text-ink-800">{label}</span>
                    <span className="font-bold tabular-nums text-ink-900">{value}</span>
                  </div>
                ))}
              </Card>
            ))}

            <Busy busy={busy} onClick={() => void enviar()}>
              📄 Gerar PDF e enviar
            </Busy>
          </>
        )}
      </div>
    </div>
  );
}
