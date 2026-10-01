import { db } from "@/data/db";
import type { Customer, Product, Sale } from "@/data/types";
import { Pdf } from "@/lib/pdf";
import { brl, date as fmtDate, datetime, num } from "@/lib/format";
import { D } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, UNIT_LABELS } from "@/lib/defaults";
import { pixPayload, prettyKey, type PixKeyType } from "@/lib/pix";
import type { Period } from "@/lib/period";
import { getSettings } from "./settings";
import { BusinessError } from "./codes";
import type { CompanySettings } from "@/lib/defaults";

const unit = (u: string) => UNIT_LABELS[u] ?? u.toLowerCase();

/** Cabeçalho comum a comprovante, catálogo e relatórios. */
function header(pdf: Pdf, settings: CompanySettings, subtitle: string) {
  pdf.text(settings.storeName || "Loja da Banana", { size: 17, bold: true });

  const lines = [
    settings.storeDocument ? `CNPJ/CPF: ${settings.storeDocument}` : "",
    settings.storeAddress,
    settings.storeCity,
    settings.storeWhatsapp ? `WhatsApp: ${settings.storeWhatsapp}` : "",
  ].filter(Boolean);
  for (const line of lines) pdf.text(line, { size: 9, gray: 0.35 });

  pdf.spacer(4);
  pdf.text(subtitle, { size: 12, bold: true });
  pdf.rule();
}

// ---------------------------------------------------------------------------
// Comprovante de venda
// ---------------------------------------------------------------------------

export type ReceiptDocument = {
  pdf: Pdf;
  fileName: string;
  /** Mensagem pronta para o WhatsApp, já com o Pix copia e cola. */
  text: string;
  pix: { payload: string; key: string; holder: string } | null;
  sale: Sale;
  customer: Customer | null;
};

export async function buildSaleReceipt(saleId: string): Promise<ReceiptDocument> {
  const sale = await db.sales.get(saleId);
  if (!sale) throw new BusinessError("Venda não encontrada.");

  const [settings, customer, products] = await Promise.all([
    getSettings(),
    sale.customerId ? db.customers.get(sale.customerId) : Promise.resolve(undefined),
    db.products.bulkGet(sale.items.map((i) => i.productId)),
  ]);
  const byId = new Map(
    products.filter((p): p is Product => Boolean(p)).map((p) => [p.id, p]),
  );

  const pix = buildPix(settings, sale);
  const title = `Comprovante de venda ${sale.number}`;
  const pdf = new Pdf(title);

  header(pdf, settings, "COMPROVANTE DE VENDA");

  pdf.row("Número", sale.number, { size: 10, bold: true });
  pdf.row("Data", datetime(sale.soldAt), { size: 9, gray: 0.3 });
  if ((sale.revision ?? 1) > 1) {
    pdf.row("Versão", `${sale.revision}ª — substitui a emissão anterior`, { size: 9, gray: 0.3 });
  }
  if (sale.status === "CANCELLED") {
    pdf.spacer(2);
    pdf.text("VENDA CANCELADA", { size: 12, bold: true });
  }
  pdf.row("Cliente", customer?.name ?? "Consumidor no balcão", { size: 9, gray: 0.3 });
  pdf.row("Pagamento", PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod,
    { size: 9, gray: 0.3 });

  pdf.spacer(6);
  const colQty = 330;
  const colPrice = 430;
  const colTotal = pdf.right;

  pdf.columns([
    { text: "Produto", x: pdf.left },
    { text: "Qtd", x: colQty, align: "right" },
    { text: "Preço", x: colPrice, align: "right" },
    { text: "Total", x: colTotal, align: "right" },
  ], { bold: true, size: 9 });
  pdf.rule(0.7);

  for (const item of sale.items) {
    const product = byId.get(item.productId);
    pdf.columns([
      { text: product?.name ?? "Produto removido", x: pdf.left, width: 270 },
      { text: `${num(D(item.quantity), 3)} ${unit(product?.unit ?? "UN")}`, x: colQty, align: "right" },
      { text: brl(item.unitPrice), x: colPrice, align: "right" },
      { text: brl(item.total), x: colTotal, align: "right" },
    ], { size: 9 });

    if (D(item.discountPct).greaterThan(0)) {
      pdf.text(`desconto de ${num(D(item.discountPct), 2)}%`,
        { size: 8, gray: 0.45, indent: 8 });
    }
  }

  pdf.rule(0.7);
  pdf.row("Subtotal", brl(sale.subtotal), { size: 10 });
  if (D(sale.discount).greaterThan(0)) pdf.row("Descontos", `- ${brl(sale.discount)}`, { size: 10 });
  if (D(sale.freight).greaterThan(0)) pdf.row("Frete", brl(sale.freight), { size: 10 });
  pdf.row("TOTAL", brl(sale.total), { size: 14, bold: true });

  if (pix) {
    pdf.spacer(10);
    pdf.rule();
    pdf.text("PAGUE COM PIX", { size: 11, bold: true });
    pdf.row("Chave", prettyKey(pix.key, settings.pixKeyType as PixKeyType), { size: 10 });
    pdf.row("Beneficiário", pix.holder, { size: 9, gray: 0.3 });
    pdf.spacer(4);
    pdf.text("Pix copia e cola:", { size: 9, bold: true });
    pdf.text(pix.payload, { size: 7, gray: 0.25, maxWidth: pdf.width });
  }

  if (sale.notes) {
    pdf.spacer(6);
    pdf.text(`Observações: ${sale.notes}`, { size: 9, gray: 0.35, maxWidth: pdf.width });
  }

  if (settings.receiptFooter) {
    pdf.spacer(10);
    pdf.text(settings.receiptFooter, { size: 9, gray: 0.4, align: "center" });
  }

  return {
    pdf,
    fileName: `comprovante-${sale.number}.pdf`,
    text: receiptText(sale, customer ?? null, byId, settings, pix),
    pix,
    sale,
    customer: customer ?? null,
  };
}

function buildPix(settings: CompanySettings, sale: Sale) {
  if (settings.pixEnabled !== "true" || !settings.pixKey.trim()) return null;
  try {
    const payload = pixPayload({
      key: settings.pixKey,
      keyType: (settings.pixKeyType || "AUTO") as PixKeyType,
      holder: settings.pixHolder || settings.storeName,
      city: settings.pixCity || settings.storeCity,
      amount: sale.total,
      txid: sale.number,
    });
    return {
      payload,
      key: settings.pixKey,
      holder: settings.pixHolder || settings.storeName,
    };
  } catch {
    // Configuração incompleta: o comprovante sai sem o bloco do Pix.
    return null;
  }
}

function receiptText(
  sale: Sale,
  customer: Customer | null,
  byId: Map<string, Product>,
  settings: CompanySettings,
  pix: { payload: string; key: string; holder: string } | null,
): string {
  const lines: string[] = [];
  lines.push(`*${settings.storeName || "Loja da Banana"}*`);
  lines.push(`Comprovante ${sale.number} — ${datetime(sale.soldAt)}`);
  if (sale.status === "CANCELLED") lines.push("*VENDA CANCELADA*");
  if (customer) lines.push(`Cliente: ${customer.name}`);
  lines.push("");

  for (const item of sale.items) {
    const product = byId.get(item.productId);
    lines.push(
      `• ${product?.name ?? "Produto"} — ${num(D(item.quantity), 3)} ` +
      `${unit(product?.unit ?? "UN")} x ${brl(item.unitPrice)} = ${brl(item.total)}`,
    );
  }

  lines.push("");
  if (D(sale.discount).greaterThan(0)) lines.push(`Descontos: -${brl(sale.discount)}`);
  if (D(sale.freight).greaterThan(0)) lines.push(`Frete: ${brl(sale.freight)}`);
  lines.push(`*TOTAL: ${brl(sale.total)}*`);
  lines.push(`Pagamento: ${PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod}`);

  if (pix) {
    lines.push("");
    lines.push(`*Pague com Pix* — chave: ${prettyKey(pix.key, settings.pixKeyType as PixKeyType)}`);
    lines.push(`Em nome de: ${pix.holder}`);
    lines.push("");
    lines.push("Copie o código abaixo e cole no seu banco:");
    lines.push(pix.payload);
  }

  if (settings.receiptFooter) {
    lines.push("");
    lines.push(settings.receiptFooter);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Catálogo de produtos
// ---------------------------------------------------------------------------

export type CatalogDocument = { pdf: Pdf; fileName: string; text: string; count: number };

export async function buildCatalog(options: {
  wholesale?: boolean;
  onlyInStock?: boolean;
} = {}): Promise<CatalogDocument> {
  const settings = await getSettings();
  const products = (await db.products.toArray())
    .filter((p) => !p.deletedAt && p.active && (p.kind === "FINISHED" || p.kind === "RESALE"))
    .filter((p) => (options.onlyInStock ? D(p.quantity).greaterThan(0) : true))
    .sort((a, b) =>
      (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name));

  const priceOf = (p: Product) =>
    options.wholesale && D(p.wholesalePrice).greaterThan(0) ? p.wholesalePrice : p.salePrice;

  const pdf = new Pdf("Catálogo de produtos");
  header(pdf, settings, options.wholesale ? "CATÁLOGO — PREÇOS DE ATACADO" : "CATÁLOGO DE PRODUTOS");
  pdf.text(`Preços válidos em ${fmtDate(new Date())}`, { size: 9, gray: 0.4 });
  pdf.spacer(6);

  let lastCategory = "";
  for (const product of products) {
    const category = product.category ?? "Outros";
    if (category !== lastCategory) {
      pdf.spacer(6);
      pdf.text(category.toUpperCase(), { size: 10, bold: true, gray: 0.25 });
      pdf.rule(0.8);
      lastCategory = category;
    }
    pdf.columns([
      { text: product.name, x: pdf.left, width: 340 },
      { text: `${brl(priceOf(product))} / ${unit(product.unit)}`, x: pdf.right, align: "right" },
    ], { size: 10 });

    const faixas = (product.qtyDiscounts ?? [])
      .filter((f) => D(f.discountPct).greaterThan(0))
      .sort((a, b) => D(a.minQty).comparedTo(D(b.minQty)))
      .map((f) => `${num(D(f.minQty), 2)}+ = -${num(D(f.discountPct), 2)}%`);
    if (faixas.length) {
      pdf.text(`Atacado: ${faixas.join(" · ")}`, { size: 8, gray: 0.45, indent: 8 });
    }
  }

  if (!products.length) {
    pdf.text("Nenhum produto ativo para mostrar.", { size: 10, gray: 0.4 });
  }

  if (settings.storeWhatsapp) {
    pdf.spacer(12);
    pdf.text(`Pedidos pelo WhatsApp ${settings.storeWhatsapp}`,
      { size: 10, bold: true, align: "center" });
  }

  return {
    pdf,
    fileName: `catalogo-${new Date().toISOString().slice(0, 10)}.pdf`,
    text: catalogText(products, priceOf, settings, options.wholesale ?? false),
    count: products.length,
  };
}

function catalogText(
  products: Product[],
  priceOf: (p: Product) => string,
  settings: CompanySettings,
  wholesale: boolean,
): string {
  const lines: string[] = [];
  lines.push(`*${settings.storeName || "Loja da Banana"}*`);
  lines.push(wholesale ? "_Tabela de atacado_" : "_Catálogo de produtos_");
  lines.push(`Preços de ${fmtDate(new Date())}`);

  let lastCategory = "";
  for (const product of products) {
    const category = product.category ?? "Outros";
    if (category !== lastCategory) {
      lines.push("");
      lines.push(`*${category}*`);
      lastCategory = category;
    }
    lines.push(`• ${product.name} — ${brl(priceOf(product))}/${unit(product.unit)}`);

    const faixas = (product.qtyDiscounts ?? [])
      .filter((f) => D(f.discountPct).greaterThan(0))
      .sort((a, b) => D(a.minQty).comparedTo(D(b.minQty)))
      .map((f) => `${num(D(f.minQty), 2)}+ = -${num(D(f.discountPct), 2)}%`);
    if (faixas.length) lines.push(`   atacado: ${faixas.join(" · ")}`);
  }

  if (settings.storeWhatsapp) {
    lines.push("");
    lines.push(`Faça seu pedido: ${settings.storeWhatsapp}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------

export type ReportColumn = { title: string; align?: "left" | "right"; width?: number };
export type ReportSection = {
  title?: string;
  note?: string;
  columns?: ReportColumn[];
  rows?: string[][];
  totals?: [string, string][];
  /** Linhas simples de "rótulo: valor". */
  pairs?: [string, string][];
};

/** Monta o PDF de qualquer relatório a partir de seções já calculadas. */
export async function buildReport(
  title: string,
  period: Period | null,
  sections: ReportSection[],
): Promise<{ pdf: Pdf; fileName: string }> {
  const settings = await getSettings();
  const pdf = new Pdf(title);
  header(pdf, settings, title.toUpperCase());

  if (period) pdf.text(`Período: ${period.label}`, { size: 9, gray: 0.35 });
  pdf.text(`Emitido em ${datetime(new Date())}`, { size: 9, gray: 0.35 });
  pdf.spacer(8);

  for (const section of sections) {
    if (section.title) {
      pdf.spacer(6);
      pdf.text(section.title, { size: 11, bold: true });
      pdf.rule(0.75);
    }
    if (section.note) {
      pdf.text(section.note, { size: 9, gray: 0.4, maxWidth: pdf.width });
      pdf.spacer(2);
    }

    for (const [label, value] of section.pairs ?? []) {
      pdf.row(label, value, { size: 10 });
    }

    if (section.columns?.length) {
      const positions = layout(section.columns, pdf.left, pdf.right);
      pdf.columns(
        section.columns.map((column, index) => ({
          text: column.title,
          x: positions[index].x,
          align: column.align,
          width: positions[index].width,
        })),
        { bold: true, size: 9 },
      );
      pdf.rule(0.8);

      for (const row of section.rows ?? []) {
        pdf.columns(
          row.map((cell, index) => ({
            text: cell,
            x: positions[index]?.x ?? pdf.left,
            align: section.columns?.[index]?.align,
            width: positions[index]?.width,
          })),
          { size: 9 },
        );
      }
      if (!section.rows?.length) {
        pdf.text("Nada no período.", { size: 9, gray: 0.45 });
      }
    }

    if (section.totals?.length) {
      pdf.rule(0.8);
      for (const [label, value] of section.totals) {
        pdf.row(label, value, { size: 10, bold: true });
      }
    }
  }

  return {
    pdf,
    fileName: `${slug(title)}-${new Date().toISOString().slice(0, 10)}.pdf`,
  };
}

/** Distribui as colunas na largura da página respeitando os pesos informados. */
function layout(columns: ReportColumn[], left: number, right: number) {
  const total = columns.reduce((sum, column) => sum + (column.width ?? 1), 0);
  const available = right - left;
  const result: { x: number; width: number }[] = [];

  let cursor = left;
  for (const column of columns) {
    const width = (available * (column.width ?? 1)) / total;
    result.push({
      x: column.align === "right" ? cursor + width - 2 : cursor,
      width: width - 6,
    });
    cursor += width;
  }
  return result;
}

function slug(text: string): string {
  return text
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
