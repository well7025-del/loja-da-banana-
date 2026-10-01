import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import type { FinanceDirection } from "@/data/types";
import { ACCOUNT_KIND_LABELS, DEFAULT_CATEGORIES } from "@/lib/defaults";
import { createFinanceEntry, createTransfer } from "@/logic/finance";
import { ensureDefaultAccounts } from "@/logic/reconciliation";
import {
  Busy, Card, DocumentPicker, Field, Message, PageHeader, Tabs,
} from "@/components/ui";

/** Despesa e receita viram título; transferência é movimento entre contas próprias. */
type Mode = "PAYABLE" | "RECEIVABLE" | "TRANSFER";

export default function FinanceNewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(
    params.get("tipo") === "RECEIVABLE" ? "RECEIVABLE"
      : params.get("tipo") === "TRANSFER" ? "TRANSFER" : "PAYABLE",
  );
  const direction: FinanceDirection = mode === "RECEIVABLE" ? "RECEIVABLE" : "PAYABLE";
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [installments, setInstallments] = useState("1");
  const [category, setCategory] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");
  const [document, setDocument] = useState<File | null>(null);
  const [accountId, setAccountId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void ensureDefaultAccounts(); }, []);

  const accounts = useLiveQuery(
    async () => (await db.accounts.toArray())
      .filter((a) => a.active)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  /**
   * O <select> mostra a primeira conta antes de o estado ser preenchido.
   * Sem resolver aqui, quem fosse rápido gravaria com a conta vazia e veria
   * "escolha a conta" num campo que já parecia escolhido.
   */
  const fromId = fromAccountId || accounts?.[0]?.id || "";
  const toId = toAccountId || accounts?.[1]?.id || accounts?.[0]?.id || "";
  /** Transferência precisa de duas contas; elas são criadas na primeira abertura. */
  const contasProntas = mode !== "TRANSFER" || (accounts?.length ?? 0) >= 2;

  const customers = useLiveQuery(
    async () => (await db.customers.toArray())
      .filter((c) => !c.deletedAt && c.active)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const categories = DEFAULT_CATEGORIES.filter((c) => c.direction === direction);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === "TRANSFER") {
        await createTransfer({
          fromAccountId: fromId, toAccountId: toId, amount,
          description: description.trim(),
          happenedAt: new Date(dueDate).toISOString(),
          document,
        });
        navigate("/financeiro");
        return;
      }

      if (!description.trim()) { setError("Informe a descrição do lançamento."); setBusy(false); return; }
      await createFinanceEntry({
        direction, description: description.trim(), amount,
        dueDate: new Date(dueDate).toISOString(),
        category: category || null,
        customerId: direction === "RECEIVABLE" ? customerId || null : null,
        supplierName: direction === "PAYABLE" ? supplierName.trim() || null : null,
        installments: Number(installments || 1),
        notes: notes.trim() || undefined,
        accountId: accountId || null,
        document,
      });
      navigate(direction === "PAYABLE" ? "/financeiro/pagar" : "/financeiro/receber");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Novo lançamento"
        subtitle="Despesa, receita ou transferência — com documento anexado" />

      <div className="space-y-4">
        <Message error={error} />

        <Card className="space-y-3">
          <div>
            <span className="label">Tipo</span>
            <Tabs value={mode} onChange={setMode} options={[
              { id: "PAYABLE" as Mode, label: "Despesa", icon: "📤" },
              { id: "RECEIVABLE" as Mode, label: "Receita", icon: "📥" },
              { id: "TRANSFER" as Mode, label: "Transferência", icon: "🔄" },
            ]} />
          </div>

          {mode === "TRANSFER" && (
            <>
              <p className="text-sm text-ink-600">
                Dinheiro saindo de uma conta sua e entrando em outra. Não entra no
                resultado — fica só registrado, com o comprovante.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="De" required>
                  <select className="input" value={fromId}
                    onChange={(e) => setFromAccountId(e.target.value)}>
                    {(accounts ?? []).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} — {ACCOUNT_KIND_LABELS[account.kind]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Para" required>
                  <select className="input" value={toId}
                    onChange={(e) => setToAccountId(e.target.value)}>
                    {(accounts ?? []).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} — {ACCOUNT_KIND_LABELS[account.kind]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </>
          )}

          <Field label="Descrição" required={mode !== "TRANSFER"}>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Energia elétrica de setembro" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor total" required>
              <input className="input !text-xl !font-bold" inputMode="decimal" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </Field>
            {mode !== "TRANSFER" && (
              <Field label="Parcelas" hint="Mensais">
                <input className="input" inputMode="numeric" value={installments}
                  onChange={(e) => setInstallments(e.target.value)} />
              </Field>
            )}
          </div>

          <Field label={mode === "TRANSFER" ? "Data" : "1º vencimento"} required>
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>

          {mode !== "TRANSFER" && (
          <Field label="Categoria">
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Sem categoria</option>
              {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
          )}

          {mode !== "TRANSFER" && (
          <Field label="Conta" hint="Onde o dinheiro entra ou sai">
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Não informar</option>
              {(accounts ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} — {ACCOUNT_KIND_LABELS[account.kind]}
                </option>
              ))}
            </select>
          </Field>
          )}

          {mode === "TRANSFER" ? null : direction === "RECEIVABLE" ? (
            <Field label="Cliente">
              <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Não informar</option>
                {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Fornecedor">
              <input className="input" value={supplierName} onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Opcional" />
            </Field>
          )}

          {mode !== "TRANSFER" && (
            <Field label="Observações">
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Opcional" />
            </Field>
          )}

          <DocumentPicker file={document} onPick={setDocument}
            label={mode === "TRANSFER" ? "Comprovante da transferência" : "Nota fiscal ou recibo"}
            hint="Fica guardado junto do lançamento e entra no backup." />
        </Card>

        <Busy busy={busy} onClick={() => void submit()} disabled={!contasProntas}>
          {mode === "TRANSFER"
            ? (contasProntas ? "Registrar transferência" : "Preparando as contas…")
            : "Registrar lançamento"}
        </Busy>
      </div>
    </div>
  );
}
