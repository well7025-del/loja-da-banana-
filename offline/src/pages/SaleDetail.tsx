import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { D } from "@/lib/money";
import { brl, date, datetime, num } from "@/lib/format";
import { FINANCE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/defaults";
import { cancelSale } from "@/logic/sales";
import { buildSaleReceipt, type ReceiptDocument } from "@/logic/documents";
import { openWhatsapp, shareFile } from "@/logic/bridge";
import {
  Badge, Card, CopyBox, Message, PageHeader, SectionTitle, Spinner, StatCard,
} from "@/components/ui";

export default function SaleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptDocument | null>(null);
  const [sharing, setSharing] = useState(false);

  const data = useLiveQuery(async () => {
    if (!id) return null;
    const sale = await db.sales.get(id);
    if (!sale) return null;
    const [customer, products, entries] = await Promise.all([
      sale.customerId ? db.customers.get(sale.customerId) : Promise.resolve(undefined),
      db.products.bulkGet(sale.items.map((i) => i.productId)),
      db.finance.where("saleId").equals(sale.id).toArray(),
    ]);
    const byId = new Map(
      products.filter((p): p is NonNullable<typeof p> => Boolean(p)).map((p) => [p.id, p]),
    );
    return { sale, customer, byId, entries: entries.sort((a, b) => a.installment - b.installment) };
  }, [id]);

  // O comprovante é montado assim que a venda abre: o Pix precisa estar à mão.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    buildSaleReceipt(id)
      .then((built) => { if (!cancelled) setReceipt(built); })
      .catch(() => { if (!cancelled) setReceipt(null); });
    return () => { cancelled = true; };
  }, [id, data?.sale.revision, data?.sale.status]);

  if (data === undefined) return <Spinner />;
  if (!data?.sale) return <p className="py-8 text-center text-sm text-ink-500">Venda não encontrada.</p>;

  const { sale, customer, byId, entries } = data;

  async function cancelar() {
    const reason = window.prompt(
      "Motivo do cancelamento:\n\nO estoque será devolvido e os títulos em aberto, cancelados.",
    );
    if (reason === null) return;
    try {
      await cancelSale(sale.id, reason || "Sem motivo informado");
      setNotice("Venda cancelada e estoque estornado.");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function enviarPdf() {
    if (!receipt) return;
    setError(null); setNotice(null); setSharing(true);
    try {
      const result = await shareFile({
        fileName: receipt.fileName,
        base64: receipt.pdf.toBase64(),
        mime: "application/pdf",
        text: receipt.text,
        title: `Comprovante ${sale.number}`,
      });
      if (result.ok) setNotice(result.message); else setError(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSharing(false);
    }
  }

  async function enviarTexto() {
    if (!receipt) return;
    setError(null); setNotice(null);
    const result = await openWhatsapp(receipt.text, receipt.customer?.whatsapp ?? null);
    if (!result.ok) setError(result.message);
  }

  return (
    <div>
      {params.get("nova") === "1" && (
        <div className="mb-3"><Message success={`Venda ${sale.number} registrada com sucesso.`} /></div>
      )}
      {(error || notice) && <div className="mb-3"><Message error={error} success={notice} /></div>}

      <PageHeader
        title={`Venda ${sale.number}${(sale.revision ?? 1) > 1 ? ` (v${sale.revision})` : ""}`}
        subtitle={datetime(sale.soldAt)}
        action={sale.status === "CANCELLED"
          ? <Badge tone="red">{sale.replacedBySaleId ? "substituída" : "cancelada"}</Badge>
          : <Badge tone="green">concluída</Badge>} />

      {sale.replacedBySaleId && (
        <div className="mb-3">
          <Message info="Esta versão foi substituída por uma alteração posterior." />
          <Link to={`/vendas/${sale.replacedBySaleId}`}
            className="btn-ghost mt-2 w-full">Abrir a versão atual</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Total da venda" value={brl(sale.total)} />
        <StatCard label="Itens" value={String(sale.items.length)}
          hint={num(sale.items.reduce((acc, item) => acc + Number(item.quantity), 0), 3)} />
      </div>

      {sale.status === "COMPLETED" && (
        <>
          <SectionTitle>Comprovante</SectionTitle>
          <Card className="space-y-3">
            {receipt?.pix && (
              <CopyBox
                label="Pix copia e cola"
                value={receipt.pix.payload}
                hint={`Chave ${receipt.pix.key} — ${receipt.pix.holder}. ` +
                  "O cliente cola isso no banco e o valor já vem preenchido."}
              />
            )}
            {!receipt?.pix && (
              <p className="text-sm text-ink-500">
                Para o comprovante sair com o Pix, preencha a chave em{" "}
                <Link to="/configuracoes" className="font-semibold text-leaf-700">Configurações</Link>.
              </p>
            )}

            <div className="grid gap-2">
              <button type="button" disabled={!receipt || sharing}
                onClick={() => void enviarPdf()} className="btn-primary w-full">
                {sharing ? "Preparando…" : "📄 Enviar comprovante em PDF"}
              </button>
              <button type="button" disabled={!receipt}
                onClick={() => void enviarTexto()} className="btn-ghost w-full">
                💬 Mandar no WhatsApp{receipt?.customer?.whatsapp ? ` para ${receipt.customer.name}` : ""}
              </button>
            </div>
            <p className="hint">
              O PDF abre o menu do Android — escolha o WhatsApp e a conversa. A mensagem
              vai junto com o Pix copia e cola.
            </p>
          </Card>
        </>
      )}

      <SectionTitle>Itens</SectionTitle>
      <Card pad={false}>
        {sale.items.map((item, index) => {
          const product = byId.get(item.productId);
          return (
            <div key={index} className="row">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink-900">{product?.name ?? "(removido)"}</p>
                <p className="text-xs text-ink-500">
                  {num(D(item.quantity), 3)} {product?.unit.toLowerCase()} × {brl(item.unitPrice)}
                  {D(item.discountPct).greaterThan(0) && ` · −${num(D(item.discountPct), 1)}%`}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{brl(item.total)}</span>
            </div>
          );
        })}
        <div className="row"><span className="text-ink-500">Subtotal</span>
          <span className="font-semibold tabular-nums">{brl(sale.subtotal)}</span></div>
        {D(sale.discount).greaterThan(0) && (
          <div className="row"><span className="text-ink-500">Descontos</span>
            <span className="font-semibold tabular-nums text-leaf-700">−{brl(sale.discount)}</span></div>
        )}
        {D(sale.freight).greaterThan(0) && (
          <div className="row"><span className="text-ink-500">Frete</span>
            <span className="font-semibold tabular-nums">{brl(sale.freight)}</span></div>
        )}
        <div className="row bg-ink-50"><span className="font-bold">Total</span>
          <span className="font-bold tabular-nums">{brl(sale.total)}</span></div>
      </Card>

      <SectionTitle>Dados</SectionTitle>
      <Card pad={false}>
        <div className="row">
          <span className="text-ink-500">Cliente</span>
          {customer
            ? <Link to={`/clientes/${customer.id}`} className="font-semibold text-leaf-700">{customer.name}</Link>
            : <span className="font-semibold">Consumidor no balcão</span>}
        </div>
        <div className="row"><span className="text-ink-500">Pagamento</span>
          <span className="font-semibold">{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</span></div>
        <div className="row"><span className="text-ink-500">Canal</span>
          <span className="font-semibold">{sale.channel === "WHOLESALE" ? "Atacado" : "Varejo"}</span></div>
        {sale.notes && (
          <div className="row"><span className="text-ink-500">Observações</span>
            <span className="max-w-[60%] text-right">{sale.notes}</span></div>
        )}
        {sale.cancelReason && (
          <div className="row"><span className="text-ink-500">Motivo do cancelamento</span>
            <span className="max-w-[60%] text-right text-red-700">{sale.cancelReason}</span></div>
        )}
      </Card>

      {entries.length > 0 && (
        <>
          <SectionTitle>Financeiro</SectionTitle>
          <Card pad={false}>
            {entries.map((entry) => (
              <div key={entry.id} className="row">
                <div>
                  <p className="font-medium text-ink-800">{entry.description}</p>
                  <p className="text-xs text-ink-500">Vence em {date(entry.dueDate)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{brl(entry.amount)}</p>
                  <p className={`text-xs font-semibold ${
                    entry.status === "PAID" ? "text-leaf-700"
                      : entry.status === "CANCELLED" ? "text-ink-400" : "text-banana-700"
                  }`}>{FINANCE_STATUS_LABELS[entry.status]}</p>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      {sale.status === "COMPLETED" && (
        <div className="mt-4 space-y-2">
          <button type="button" onClick={() => navigate(`/vendas/${sale.id}/alterar`)}
            className="btn-ghost w-full">
            ✏️ Alterar venda
          </button>
          <button type="button" onClick={() => void cancelar()} className="btn-ghost w-full !text-red-600">
            Cancelar venda
          </button>
          <p className="hint text-center">
            Alterar devolve o estoque desta venda e emite uma nova versão com o mesmo número.
          </p>
        </div>
      )}
    </div>
  );
}
