import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { datetime } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, type Tone } from "@/components/ui";
import { FilterPills, SearchInput } from "@/components/search-input";
import type { AuditAction } from "@prisma/client";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Criou", UPDATE: "Alterou", DELETE: "Excluiu", CANCEL: "Cancelou",
  LOGIN: "Entrou", LOGOUT: "Saiu", LOGIN_FAILED: "Falha no login",
};

const ACTION_TONE: Record<string, Tone> = {
  CREATE: "green", UPDATE: "blue", DELETE: "red", CANCEL: "red",
  LOGIN: "neutral", LOGOUT: "neutral", LOGIN_FAILED: "yellow",
};

export default async function AuditPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; acao?: string }> }) {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "audit.read")) redirect("/");
  const { q, acao } = await searchParams;

  const logs = await prisma.auditLog.findMany({
    where: {
      companyId: user.companyId,
      ...(acao ? { action: acao as AuditAction } : {}),
      ...(q
        ? {
            OR: [
              { summary: { contains: q, mode: "insensitive" as const } },
              { userName: { contains: q, mode: "insensitive" as const } },
              { entity: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader title="Auditoria" subtitle="Quem fez o quê, quando — últimos 200 registros" />
      <div className="space-y-2">
        <SearchInput placeholder="Buscar por usuário, operação ou registro" />
        <FilterPills
          paramName="acao"
          options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </div>

      <div className="mt-3">
        {logs.length === 0 ? (
          <EmptyState icon="📝" title="Nenhum registro encontrado" />
        ) : (
          <Card pad={false}>
            {logs.map((log) => (
              <div key={log.id} className="border-b border-[var(--border)] px-4 py-3 last:border-0">
                <div className="flex items-start gap-2">
                  <Badge tone={ACTION_TONE[log.action]}>{ACTION_LABELS[log.action]}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-800">{log.summary ?? log.entity}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {log.userName ?? "Sistema"} · {datetime(log.createdAt)} · {log.entity}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
