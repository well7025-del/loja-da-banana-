import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import type { PaymentMethod, Product, SaleChannel } from "@/data/types";
import { D } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/defaults";
import { createSale, quoteSale, type Quote } from "@/logic/sales";
import { Busy, Card, Field, Message, PageHeader } from "@/components/ui";

type Line = { productId: string; quantity: string; unitPrice: string; discountPct: string };

const METHODS: PaymentMethod[] = ["PIX", "CASH", "CARD", "TRANSFER", "TERM"];

export default function SaleNewPage() {
  const navigate = useNavigate();
  const [channel, setChannel] = useState<SaleChannel>("RETAIL");
  const [customerId, setCustomerId] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [installments, setInstallments] = useState("1");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [freight, setFreight] = useState("");
  const [extraDiscount, setExtraDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalog = useLiveQuery(
    async () => (await db.products.toArray())
      .filter((p) => !p.deletedAt && p.active && (p.kind === "FINISHED" || p.kind === "RESALE"))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const customers = useLiveQuery(
    async () => (await db.customers.toArray())
      .filter((c) => !c.deletedAt && c.active)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const byId = useMemo(() => new Map((catalog ?? []).map((p) => [p.id, p])), [catalog]);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const pool = catalog ?? [];
    if (!needle) return pool.slice(0, 8);
    return pool
      .filter((p) => p.name.toLowerCase().includes(needle) ||
        p.sku.toLowerCase().includes(needle) || (p.barcode ?? "").includes(needle))
      .slice(0, 12);
  }, [catalog, search]);

  // Recalcula pelo mesmo cálculo usado ao gravar — sem duplicar a regra na tela.
  useEffect(() => {
    const valid = lines.filter((l) => D(l.quantity).greaterThan(0));
    if (!valid.length) { setQuote(null); return; }
    let cancelled = false;
    quoteSale({
      customerId: customerId || null, channel, items: valid, freight, extraDiscount,
    })
      .then((result) => { if (!cancelled) setQuote(result); })
      .catch(() => { if (!cancelled) setQuote(null); });
    return () => { cancelled = true; };
  }, [lines, customerId, channel, freight, extraDiscount]);

  function addProduct(product: Product) {
    setSearch("");
    setLines((current) => {
      const index = current.findIndex((l) => l.productId === product.id);
      if (index >= 0) {
        const next = [...current];
        next[index] = { ...next[index], quantity: String(D(next[index].quantity).plus(1)) };
        return next;
      }
      return [...current, { productId: product.id, quantity: "1", unitPrice: "", discountPct: "" }];
    });
  }

  const patch = (index: number, value: Partial<Line>) =>
    setLines((current) => current.map((l, i) => (i === index ? { ...l, ...value } : l)));

  const step = (index: number, delta: number) => {
    const next = D(lines[index].quantity).plus(delta);
    patch(index, { quantity: next.lessThan(0) ? "0" : next.toString() });
  };

  async function submit() {
    setError(null);
    const valid = lines.filter((l) => D(l.quantity).greaterThan(0));
    if (!valid.length) { setError("Adicione ao menos um produto à venda."); return; }

    setBusy(true);
    try {
      const sale = await createSale({
        customerId: customerId || null, channel, items: valid,
        paymentMethod: method,
        installments: Number(installments || 1),
        dueDate: method === "TERM" ? new Date(dueDate).toISOString() : null,
        freight, extraDiscount, notes,
      });
      navigate(`/vendas/${sale.id}?nova=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const priceOf = (product: Product) =>
    channel === "WHOLESALE" && D(product.wholesalePrice).greaterThan(0)
      ? D(product.wholesalePrice)
      : D(product.salePrice);

  return (
    <div>
      <PageHeader title="Nova venda" subtitle="Descontos de atacado aplicados automaticamente" />

      <div className="space-y-4">
        <Message error={error} />

        <Card className="space-y-3">
          <div>
            <span className="label">Tipo de venda</span>
            <div className="grid grid-cols-2 gap-2">
              {(["RETAIL", "WHOLESALE"] as const).map((value) => (
                <button key={value} type="button" onClick={() => setChannel(value)}
                  className={`rounded-xl px-3 py-3 text-sm font-bold transition ${
                    channel === value ? "bg-leaf-600 text-white" : "border border-[var(--border)] bg-white text-ink-600"
                  }`}>
                  {value === "RETAIL" ? "Varejo" : "Atacado"}
                </button>
              ))}
            </div>
          </div>
          <Field label="Cliente" hint={channel === "RETAIL" ? "Opcional no varejo" : undefined}>
            <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Consumidor no balcão</option>
              {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </Card>

        <Card className="space-y-3">
          <Field label="Adicionar produto">
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, código ou código de barras" autoComplete="off" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {matches.map((product) => (
              <button key={product.id} type="button" onClick={() => addProduct(product)}
                className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-left transition hover:border-leaf-500 active:scale-[.98]">
                <span className="block truncate text-sm font-semibold text-ink-900">{product.name}</span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  {brl(priceOf(product))}/{product.unit.toLowerCase()} ·{" "}
                  {num(D(product.quantity), 1)} em estoque
                </span>
              </button>
            ))}
            {matches.length === 0 && (
              <p className="col-span-2 rounded-xl bg-ink-50 px-3 py-3 text-sm text-ink-500">
                Nenhum produto encontrado.
              </p>
            )}
          </div>
        </Card>

        {lines.length > 0 && (
          <Card pad={false} className="divide-y divide-[var(--border)]">
            {lines.map((line, index) => {
              const product = byId.get(line.productId);
              const quoted = quote?.lines.find((l) => l.product.id === line.productId);
              const short = product && D(line.quantity).greaterThan(D(product.quantity));
              return (
                <div key={line.productId} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">{product?.name}</p>
                      <p className="text-xs text-ink-500">
                        {product?.sku}
                        {short && <span className="ml-1 font-semibold text-red-600">· estoque insuficiente</span>}
                      </p>
                    </div>
                    <button type="button" className="shrink-0 text-sm font-semibold text-red-600"
                      onClick={() => setLines((c) => c.filter((_, i) => i !== index))}>
                      Remover
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center rounded-xl border border-[var(--border)]">
                      <button type="button" onClick={() => step(index, -1)}
                        className="h-11 w-11 text-lg font-bold text-ink-600" aria-label="Diminuir">−</button>
                      <input inputMode="decimal" aria-label="Quantidade"
                        className="h-11 w-20 border-x border-[var(--border)] text-center text-base font-semibold tabular-nums outline-none"
                        value={line.quantity} onChange={(e) => patch(index, { quantity: e.target.value })} />
                      <button type="button" onClick={() => step(index, 1)}
                        className="h-11 w-11 text-lg font-bold text-ink-600" aria-label="Aumentar">+</button>
                    </div>
                    <span className="text-sm text-ink-500">{product?.unit.toLowerCase()}</span>
                    <div className="ml-auto text-right">
                      <p className="font-bold tabular-nums text-ink-900">{brl(quoted?.total ?? 0)}</p>
                      {quoted && quoted.discountPct.greaterThan(0) && (
                        <p className="text-xs font-semibold text-leaf-700">
                          −{num(quoted.discountPct, 2)}%
                          {quoted.appliedRule ? " (automático)" : ""}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-xs font-semibold text-ink-500">
                      Preço unitário
                      <input inputMode="decimal" className="input mt-1 !min-h-[2.5rem] text-sm"
                        value={line.unitPrice}
                        placeholder={product ? priceOf(product).toFixed(2) : "0,00"}
                        onChange={(e) => patch(index, { unitPrice: e.target.value })} />
                    </label>
                    <label className="text-xs font-semibold text-ink-500">
                      Desconto %
                      <input inputMode="decimal" className="input mt-1 !min-h-[2.5rem] text-sm"
                        value={line.discountPct}
                        placeholder={quoted ? num(quoted.discountPct, 2) : "0"}
                        onChange={(e) => patch(index, { discountPct: e.target.value })} />
                    </label>
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        {quote && (
          <Card className="space-y-1.5 bg-ink-50 text-sm">
            <div className="flex justify-between"><span className="text-ink-600">Subtotal</span>
              <span className="font-semibold tabular-nums">{brl(quote.subtotal)}</span></div>
            {quote.discount.greaterThan(0) && (
              <div className="flex justify-between text-leaf-700"><span>Descontos</span>
                <span className="font-semibold tabular-nums">−{brl(quote.discount)}</span></div>
            )}
            <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-base">
              <span className="font-bold">Total</span>
              <span className="font-bold tabular-nums">{brl(quote.total)}</span></div>
            <div className="flex justify-between text-xs text-ink-500">
              <span>Lucro bruto estimado</span>
              <span className="tabular-nums">
                {brl(quote.grossProfit)} ({num(quote.marginPct, 1)}%)
              </span></div>
          </Card>
        )}

        <Card className="space-y-3">
          <div>
            <span className="label">Forma de pagamento</span>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((value) => (
                <button key={value} type="button" onClick={() => setMethod(value)}
                  className={`rounded-xl px-2 py-3 text-sm font-bold transition ${
                    method === value ? "bg-banana-400 text-[#3A2C00]" : "border border-[var(--border)] bg-white text-ink-600"
                  }`}>
                  {PAYMENT_METHOD_LABELS[value]}
                </button>
              ))}
            </div>
          </div>

          {method === "TERM" && (
            <>
              {!customerId && (
                <p className="rounded-xl bg-red-50 px-3.5 py-3 text-sm font-semibold text-red-700">
                  Venda a prazo exige um cliente cadastrado.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="1º vencimento" required>
                  <input type="date" className="input" value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)} />
                </Field>
                <Field label="Parcelas">
                  <input className="input" inputMode="numeric" value={installments}
                    onChange={(e) => setInstallments(e.target.value)} />
                </Field>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Frete">
              <input className="input" inputMode="decimal" value={freight}
                onChange={(e) => setFreight(e.target.value)} placeholder="0,00" />
            </Field>
            <Field label="Desconto extra (R$)">
              <input className="input" inputMode="decimal" value={extraDiscount}
                onChange={(e) => setExtraDiscount(e.target.value)} placeholder="0,00" />
            </Field>
          </div>
          <Field label="Observações">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional" />
          </Field>
        </Card>

        <Busy busy={busy} onClick={() => void submit()} disabled={quote === null}>
          Finalizar venda {quote ? `— ${brl(quote.total)}` : ""}
        </Busy>
      </div>
    </div>
  );
}

