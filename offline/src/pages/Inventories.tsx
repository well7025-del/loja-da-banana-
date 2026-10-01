import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { brl, datetime } from "@/lib/format";
import { INVENTORY_STATUS_LABELS } from "@/lib/defaults";
import {
  INVENTORY_SCOPE_LABELS, openInventory, type InventoryScope,
} from "@/logic/inventories";
import {
  Badge, Busy, Card, EmptyState, Field, Message, PageHeader, SectionTitle, Spinner,
} from "@/components/ui";

export default function InventoriesPage() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<InventoryScope>("FINISHED");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inventories = useLiveQuery(
    async () => (await db.inventories.toArray())
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [],
  );

  const aberto = inventories?.find((i) => i.status === "OPEN");

  async function abrir() {
    setError(null);
    setBusy(true);
    try {
      const inventory = await openInventory({ scope, note: note.trim() || null });
      navigate(`/inventario/${inventory.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Inventário"
        subtitle="Contagem física conferida contra o saldo do sistema" />

      <div className="space-y-4">
        <Message error={error} />

        {aberto ? (
          <Card className="space-y-3 bg-banana-50">
            <p className="font-semibold text-banana-900">
              O inventário {aberto.code} está em contagem.
            </p>
            <p className="text-sm text-ink-600">
              Aberto em {datetime(aberto.startedAt)} · {aberto.items.length} itens.
            </p>
            <Link to={`/inventario/${aberto.id}`} className="btn-primary w-full">
              Continuar a contagem
            </Link>
          </Card>
        ) : (
          <Card className="space-y-3">
            <p className="text-sm text-ink-600">
              A contagem fotografa o saldo do sistema na abertura. É contra essa foto que
              a divergência é apurada, mesmo que o estoque continue se mexendo.
            </p>
            <Field label="O que vai ser contado">
              <select className="input" value={scope}
                onChange={(e) => setScope(e.target.value as InventoryScope)}>
                {Object.entries(INVENTORY_SCOPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Observação" hint="Opcional — quem contou, por quê">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Busy busy={busy} onClick={() => void abrir()}>Abrir contagem</Busy>
          </Card>
        )}

        <SectionTitle>Contagens anteriores</SectionTitle>
        {!inventories ? <Spinner /> : inventories.length === 0 ? (
          <EmptyState icon="📋" title="Nenhum inventário ainda"
            detail="A primeira contagem já serve de base para auditoria." />
        ) : (
          <Card pad={false}>
            {inventories.map((inventory) => (
              <Link key={inventory.id} to={`/inventario/${inventory.id}`}
                className="block active:bg-ink-50">
                <div className="row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink-900">{inventory.code}</span>
                      <Badge tone={
                        inventory.status === "CLOSED" ? "green"
                          : inventory.status === "OPEN" ? "yellow" : "neutral"
                      }>
                        {INVENTORY_STATUS_LABELS[inventory.status]}
                      </Badge>
                      {inventory.attachmentId && <span title="com documento" aria-hidden>📎</span>}
                    </div>
                    <p className="truncate text-xs text-ink-500">
                      {datetime(inventory.startedAt)} · {inventory.items.length} itens
                    </p>
                  </div>
                  {inventory.diffValue && (
                    <span className="shrink-0 text-right font-semibold tabular-nums text-ink-900">
                      {brl(inventory.diffValue)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
