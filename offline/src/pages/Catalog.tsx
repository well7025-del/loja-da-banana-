import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { buildCatalog, type CatalogDocument } from "@/logic/documents";
import { openWhatsapp, shareFile } from "@/logic/bridge";
import {
  Busy, Card, CopyBox, Message, PageHeader, Spinner, Tabs,
} from "@/components/ui";

export default function CatalogPage() {
  const [tabela, setTabela] = useState<"varejo" | "atacado">("varejo");
  const [apenasComEstoque, setApenasComEstoque] = useState(false);
  const [doc, setDoc] = useState<CatalogDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    buildCatalog({ wholesale: tabela === "atacado", onlyInStock: apenasComEstoque })
      .then((built) => { if (!cancelled) setDoc(built); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [tabela, apenasComEstoque]);

  async function enviarPdf() {
    if (!doc) return;
    setError(null); setNotice(null); setBusy(true);
    try {
      const result = await shareFile({
        fileName: doc.fileName,
        base64: doc.pdf.toBase64(),
        mime: "application/pdf",
        text: doc.text,
        title: "Catálogo de produtos",
      });
      if (result.ok) setNotice(result.message); else setError(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function enviarTexto() {
    if (!doc) return;
    setError(null); setNotice(null);
    const result = await openWhatsapp(doc.text);
    if (!result.ok) setError(result.message);
  }

  return (
    <div>
      <PageHeader title="Catálogo"
        subtitle="Mande a lista de produtos e preços pelo WhatsApp" />

      <div className="space-y-4">
        <Message error={error} success={notice} />

        <Card className="space-y-3">
          <span className="label">Qual tabela de preços</span>
          <Tabs value={tabela} onChange={setTabela} options={[
            { id: "varejo" as const, label: "Varejo", icon: "🛍️" },
            { id: "atacado" as const, label: "Atacado", icon: "📦" },
          ]} />
          <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
            <input type="checkbox" className="h-5 w-5 rounded" checked={apenasComEstoque}
              onChange={(e) => setApenasComEstoque(e.target.checked)} />
            Mostrar só o que tem em estoque
          </label>
          {tabela === "atacado" && (
            <p className="text-sm text-ink-600">
              As faixas de desconto por quantidade cadastradas em cada produto entram no
              catálogo automaticamente.
            </p>
          )}
        </Card>

        {!doc ? <Spinner label="Montando o catálogo…" /> : doc.count === 0 ? (
          <Card className="space-y-3">
            <p className="text-sm text-ink-600">
              Nenhum produto ativo para mostrar
              {apenasComEstoque ? " com saldo em estoque" : ""}.
            </p>
            <Link to="/produtos" className="btn-ghost w-full">Abrir produtos</Link>
          </Card>
        ) : (
          <>
            <Card className="space-y-2">
              <p className="text-sm font-semibold text-ink-800">
                {doc.count} produto(s) no catálogo
              </p>
              <div className="grid gap-2">
                <Busy busy={busy} onClick={() => void enviarPdf()}>
                  📄 Enviar catálogo em PDF
                </Busy>
                <button type="button" onClick={() => void enviarTexto()} className="btn-ghost w-full">
                  💬 Mandar como mensagem
                </button>
              </div>
            </Card>

            <CopyBox label="Prévia da mensagem" value={doc.text} mono={false}
              hint="É este texto que acompanha o PDF e vai na mensagem do WhatsApp." />
          </>
        )}

        <p className="px-1 text-sm text-ink-500">
          O nome da loja e o WhatsApp que aparecem no catálogo vêm de{" "}
          <Link to="/configuracoes" className="font-semibold text-leaf-700">Configurações</Link>.
        </p>
      </div>
    </div>
  );
}
