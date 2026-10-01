import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, newId, nowIso, registerLog } from "@/data/db";
import type { Customer, CustomerType, PaymentMethod, Product, SaleChannel } from "@/data/types";
import { D } from "@/lib/money";
import { brl, num } from "@/lib/format";
import { CUSTOMER_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/defaults";
import { createSale, quoteSale, updateSale, type Quote } from "@/logic/sales";
import { Busy, Card, Field, Message, PageHeader, Sheet } from "@/components/ui";

type Line = { productId: string; quantity: string; unitPrice: string; discountPct: string };

/** A venda a prazo saiu: todo recebimento acontece no ato. */
const METHODS: PaymentMethod[] = ["PIX", "CASH", "CARD", "TRANSFER"];

const DRAFT_KEY = "lojaDaBanana.rascunhoVenda";

type Draft = {
  channel: SaleChannel; customerId: string; method: PaymentMethod;
  freight: string; extraDiscount: string; notes: string; lines: Line[];
  savedAt: string;
};

export default function SaleNewPage({ mode = "nova" }: { mode?: "nova" | "alterar" }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const editing = mode === "alterar";

  const [channel, setChannel] = useState<SaleChannel>("RETAIL");
  const [customerId, setCustomerId] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [freight, setFreight] = useState("");
  const [extraDiscount, setExtraDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reason, setReason] = useState("");
  const [loaded, setLoaded] = useState(!editing);
  const [draftFound, setDraftFound] = useState(false);
  const [novoCliente, setNovoCliente] = useState(false);

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

  // --- Alteração: carrega a venda que será substituída -------------------
  useEffect(() => {
    if (!editing || !id) return;
    db.sales.get(id).then((sale) => {
      if (!sale) { setError("Venda não encontrada."); setLoaded(true); return; }
      if (sale.status === "CANCELLED") {
        setError("Esta venda está cancelada e não pode ser alterada.");
        setLoaded(true);
        return;
      }
      setChannel(sale.channel);
      setCustomerId(sale.customerId ?? "");
      setMethod(METHODS.includes(sale.paymentMethod) ? sale.paymentMethod : "PIX");
      setFreight(D(sale.freight).greaterThan(0) ? D(sale.freight).toFixed(2) : "");
      setNotes(sale.notes ?? "");
      setLines(sale.items.map((item) => ({
        productId: item.productId,
        quantity: D(item.quantity).toString(),
        unitPrice: D(item.unitPrice).toFixed(2),
        discountPct: D(item.discountPct).greaterThan(0) ? D(item.discountPct).toString() : "",
      })));
      setLoaded(true);
    });
  }, [editing, id]);

  // --- Rascunho: a venda em andamento sobrevive a fechar o aplicativo ----
  useEffect(() => {
    if (editing) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Draft;
      if (!draft.lines?.length) return;
      setChannel(draft.channel ?? "RETAIL");
      setCustomerId(draft.customerId ?? "");
      setMethod(draft.method ?? "PIX");
      setFreight(draft.freight ?? "");
      setExtraDiscount(draft.extraDiscount ?? "");
      setNotes(draft.notes ?? "");
      setLines(draft.lines);
      setDraftFound(true);
    } catch {
      // Rascunho ilegível: segue com a tela vazia.
    }
  }, [editing]);

  useEffect(() => {
    if (editing || !loaded) return;
    try {
      if (!lines.length) localStorage.removeItem(DRAFT_KEY);
      else {
        const draft: Draft = {
          channel, customerId, method, freight, extraDiscount, notes, lines,
          savedAt: nowIso(),
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      }
    } catch {
      // Sem espaço ou modo restrito: o rascunho é um conforto, não um requisito.
    }
  }, [editing, loaded, channel, customerId, method, freight, extraDiscount, notes, lines]);

  const descartarRascunho = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* nada a fazer */ }
    setLines([]); setCustomerId(""); setFreight(""); setExtraDiscount(""); setNotes("");
    setDraftFound(false);
  };

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
    if (editing && !reason.trim()) { setError("Explique o motivo da alteração."); return; }

    setBusy(true);
    try {
      const payload = {
        customerId: customerId || null, channel, items: valid,
        paymentMethod: method, freight, extraDiscount, notes,
      };
      const sale = editing
        ? await updateSale(id!, payload, reason)
        : await createSale(payload);

      try { localStorage.removeItem(DRAFT_KEY); } catch { /* nada a fazer */ }
      navigate(`/vendas/${sale.id}?nova=1`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const priceOf = (product: Product) =>
    channel === "WHOLESALE" && D(product.wholesalePrice).greaterThan(0)
      ? D(product.wholesalePrice)
      : D(product.salePrice);

  if (!loaded) return <p className="py-8 text-center text-sm text-ink-500">Carregando…</p>;

  return (
    <div>
      <PageHeader
        title={editing ? "Alterar venda" : "Nova venda"}
        subtitle={editing
          ? "A versão anterior fica registrada como substituída"
          : "Descontos de atacado aplicados automaticamente"}
      />

      <div className="space-y-4">
        <Message error={error} />

        {draftFound && (
          <div className="flex items-center gap-3 rounded-xl bg-sky-50 px-3.5 py-3 text-sm ring-1 ring-sky-200">
            <span className="flex-1 font-medium text-sky-900">
              Recuperamos a venda que você tinha começado.
            </span>
            <button type="button" onClick={descartarRascunho}
              className="shrink-0 font-bold text-sky-800 underline">Descartar</button>
          </div>
        )}

        {editing && (
          <Card className="space-y-2 bg-banana-50">
            <Field label="Motivo da alteração" required
              hint="Fica no histórico e no relatório de auditoria.">
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: cliente trocou um item" />
            </Field>
          </Card>
        )}

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
          <button type="button" onClick={() => setNovoCliente(true)}
            className="btn-ghost w-full !justify-start !px-0 text-leaf-700">
            + Cadastrar cliente novo
          </button>
        </Card>

        <Card className="space-y-3">
          <Field label="Adicionar produto">
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, código ou código de barras" autoComplete="off" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {matches.map((product) => (
              <button key={product.id} type="button" onClick={() => addProduct(product)}
                className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-left transition hover:border-leaf-500 active:scale-[.98]">
                {product.imageUrl && (
                  <img src={product.imageUrl} alt="" aria-hidden
                    className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-900">{product.name}</span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    {brl(priceOf(product))}/{product.unit.toLowerCase()} ·{" "}
                    {num(D(product.quantity), 1)} em estoque
                  </span>
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
            {quote.freight.greaterThan(0) && (
              <div className="flex justify-between"><span className="text-ink-600">Frete</span>
                <span className="font-semibold tabular-nums">{brl(quote.freight)}</span></div>
            )}
            <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-base">
              <span className="font-bold">Total</span>
              <span className="font-bold tabular-nums">{brl(quote.total)}</span></div>
          </Card>
        )}

        <Card className="space-y-3">
          <div>
            <span className="label">Forma de pagamento</span>
            <div className="grid grid-cols-4 gap-2">
              {METHODS.map((value) => (
                <button key={value} type="button" onClick={() => setMethod(value)}
                  className={`rounded-xl px-1 py-3 text-sm font-bold transition ${
                    method === value ? "bg-banana-400 text-[#3A2C00]" : "border border-[var(--border)] bg-white text-ink-600"
                  }`}>
                  {PAYMENT_METHOD_LABELS[value]}
                </button>
              ))}
            </div>
          </div>

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
          {editing ? "Salvar alteração" : "Finalizar venda"} {quote ? `— ${brl(quote.total)}` : ""}
        </Busy>
      </div>

      <NovoClienteSheet
        open={novoCliente}
        onClose={() => setNovoCliente(false)}
        onCreated={(customer) => { setCustomerId(customer.id); setNovoCliente(false); }}
      />
    </div>
  );
}

/** Cadastro rápido no meio da venda: só o essencial, o resto se completa depois. */
function NovoClienteSheet({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (customer: Customer) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomerType>("CONSUMER");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setName(""); setWhatsapp(""); setCity(""); setType("CONSUMER"); setError(null); }
  }, [open]);

  async function salvar() {
    setError(null);
    if (!name.trim()) { setError("Informe o nome do cliente."); return; }

    setBusy(true);
    try {
      const customer: Customer = {
        id: newId(),
        name: name.trim(),
        type,
        taxId: null,
        phone: whatsapp.trim() || null,
        whatsapp: whatsapp.trim() || null,
        city: city.trim() || null,
        address: null,
        creditLimit: "0",
        defaultDiscountPct: "0",
        paymentTerms: null,
        notes: null,
        active: true,
        deletedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await db.customers.add(customer);
      await registerLog("CREATE", "Cliente", `Cadastrou ${customer.name} durante uma venda`, customer.id);
      onCreated(customer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} title="Cliente novo" onClose={onClose}>
      <div className="space-y-3">
        <Message error={error} />
        <Field label="Nome" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Nome ou razão social" />
        </Field>
        <Field label="Tipo">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as CustomerType)}>
            {Object.entries(CUSTOMER_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="WhatsApp" hint="Para mandar o comprovante">
            <input className="input" inputMode="tel" value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)} placeholder="(00) 90000-0000" />
          </Field>
          <Field label="Cidade">
            <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
        </div>
        <Busy busy={busy} onClick={() => void salvar()}>Cadastrar e usar na venda</Busy>
        <p className="hint">
          O cadastro completo (limite, desconto padrão, endereço) fica em Mais › Clientes.
        </p>
      </div>
    </Sheet>
  );
}
