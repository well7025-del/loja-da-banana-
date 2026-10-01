import { useEffect, useMemo, useState } from "react";
import { SETTING_LABELS, type CompanySettings } from "@/lib/defaults";
import { getSettings, saveSettings } from "@/logic/settings";
import { resetEverything } from "@/logic/seed";
import { isValidPayload, PIX_KEY_TYPE_LABELS, pixPayload, type PixKeyType } from "@/lib/pix";
import {
  Busy, Card, CopyBox, Field, Message, PageHeader, SectionTitle, Spinner,
} from "@/components/ui";

const PRICING: (keyof CompanySettings)[] = [
  "taxPct", "fixedOverheadPct", "commissionPct", "cardFeePct", "defaultTargetMarginPct",
];
const ALERTS: (keyof CompanySettings)[] = [
  "expiryAlertDays", "inactiveCustomerDays", "productionCoverageDays", "purchaseCoverageDays",
];
const STORE: (keyof CompanySettings)[] = [
  "storeName", "storeDocument", "storeAddress", "storeCity", "storeWhatsapp", "receiptFooter",
];
const RECONCILE: (keyof CompanySettings)[] = [
  "reconcileDaysTolerance", "cardDaysTolerance", "cardFeeTolerancePct",
];

export default function SettingsPage() {
  const [values, setValues] = useState<CompanySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => { getSettings().then(setValues); }, []);
  if (!values) return <Spinner />;

  const set = (key: keyof CompanySettings, value: string) =>
    setValues((current) => (current ? { ...current, [key]: value } : current));

  async function salvar() {
    setBusy(true);
    try {
      await saveSettings(values!);
      setSuccess("Parâmetros salvos.");
    } finally {
      setBusy(false);
    }
  }

  async function recomeçar() {
    const texto = window.prompt(
      "Isso APAGA todos os dados deste aparelho (produtos, estoque, vendas, financeiro) " +
      "e recria o catálogo inicial.\n\nFaça um backup antes.\n\n" +
      "Para confirmar, digite: APAGAR",
    );
    if (texto !== "APAGAR") return;
    await resetEverything();
    window.location.hash = "#/";
    window.location.reload();
  }

  return (
    <div>
      <PageHeader title="Configurações"
        subtitle="Parâmetros que alimentam preços, alertas e recomendações" />

      <div className="space-y-4">
        {success && <Message success={success} />}

        <Card className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Dados da loja</p>
          <p className="text-sm text-ink-600">
            Aparecem no comprovante de venda e no catálogo que você manda pelo WhatsApp.
          </p>
          {STORE.map((key) => (
            <Field key={key} label={SETTING_LABELS[key].label} hint={SETTING_LABELS[key].help}>
              <input className="input" value={values[key]} onChange={(e) => set(key, e.target.value)} />
            </Field>
          ))}
        </Card>

        <PixSettings values={values} set={set} />

        <Card className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Formação de preço</p>
          <div className="grid grid-cols-2 gap-3">
            {PRICING.map((key) => (
              <Field key={key} label={SETTING_LABELS[key].label} hint={SETTING_LABELS[key].help}>
                <input className="input" inputMode="decimal" value={values[key]}
                  onChange={(e) => set(key, e.target.value)} />
              </Field>
            ))}
          </div>
        </Card>

        <Card className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
            Alertas e recomendações
          </p>
          <div className="grid grid-cols-2 gap-3">
            {ALERTS.map((key) => (
              <Field key={key} label={SETTING_LABELS[key].label} hint={SETTING_LABELS[key].help}>
                <input className="input" inputMode="numeric" value={values[key]}
                  onChange={(e) => set(key, e.target.value)} />
              </Field>
            ))}
          </div>
          <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
            <input type="checkbox" className="h-5 w-5 rounded"
              checked={values.allowNegativeStock === "true"}
              onChange={(e) => set("allowNegativeStock", String(e.target.checked))} />
            Permitir venda sem saldo em estoque
          </label>
        </Card>

        <Card className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
            Conferência do extrato
          </p>
          <p className="text-sm text-ink-600">
            Quanto o sistema pode se afastar da data e do valor da venda ao procurar o
            crédito correspondente no extrato.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {RECONCILE.map((key) => (
              <Field key={key} label={SETTING_LABELS[key].label} hint={SETTING_LABELS[key].help}>
                <input className="input" inputMode="decimal" value={values[key]}
                  onChange={(e) => set(key, e.target.value)} />
              </Field>
            ))}
          </div>
        </Card>

        <Busy busy={busy} onClick={() => void salvar()}>Salvar parâmetros</Busy>

        <SectionTitle>Zona de risco</SectionTitle>
        <Card className="space-y-3">
          <p className="text-sm text-ink-600">
            Apaga tudo e volta o aplicativo ao estado inicial, com o catálogo de produtos zerado.
            Use apenas se quiser recomeçar do zero.
          </p>
          <button type="button" onClick={() => void recomeçar()} className="btn-danger w-full">
            Apagar todos os dados e recomeçar
          </button>
        </Card>
      </div>
    </div>
  );
}

/**
 * Pix do comprovante.
 *
 * O "copia e cola" é montado aqui mesmo e conferido na hora: se a chave, o
 * nome ou a cidade estiverem faltando, o erro aparece antes de a primeira
 * venda sair com um comprovante que o banco do cliente recusaria.
 */
function PixSettings({ values, set }: {
  values: CompanySettings;
  set: (key: keyof CompanySettings, value: string) => void;
}) {
  const preview = useMemo(() => {
    if (!values.pixKey.trim()) return { payload: null, error: null };
    try {
      const payload = pixPayload({
        key: values.pixKey,
        keyType: (values.pixKeyType || "AUTO") as PixKeyType,
        holder: values.pixHolder || values.storeName,
        city: values.pixCity || values.storeCity,
        amount: "1.00",
        txid: "TESTE",
      });
      return { payload: isValidPayload(payload) ? payload : null, error: null };
    } catch (e) {
      return { payload: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [values.pixKey, values.pixKeyType, values.pixHolder, values.pixCity,
      values.storeName, values.storeCity]);

  return (
    <Card className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
        Recebimento por Pix
      </p>
      <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
        <input type="checkbox" className="h-5 w-5 rounded"
          checked={values.pixEnabled === "true"}
          onChange={(e) => set("pixEnabled", String(e.target.checked))} />
        Incluir os dados do Pix no comprovante de venda
      </label>

      {values.pixEnabled === "true" && (
        <>
          <Field label={SETTING_LABELS.pixKey.label} hint={SETTING_LABELS.pixKey.help} required>
            <input className="input" value={values.pixKey}
              onChange={(e) => set("pixKey", e.target.value)} placeholder="CPF, telefone, e-mail..." />
          </Field>
          <Field label={SETTING_LABELS.pixKeyType.label} hint={SETTING_LABELS.pixKeyType.help}>
            <select className="input" value={values.pixKeyType}
              onChange={(e) => set("pixKeyType", e.target.value)}>
              {Object.entries(PIX_KEY_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={SETTING_LABELS.pixHolder.label} hint="Como está no banco" required>
              <input className="input" value={values.pixHolder}
                onChange={(e) => set("pixHolder", e.target.value)} />
            </Field>
            <Field label={SETTING_LABELS.pixCity.label} hint="Exigida pelo padrão" required>
              <input className="input" value={values.pixCity}
                onChange={(e) => set("pixCity", e.target.value)} />
            </Field>
          </div>

          {preview.error && <Message error={preview.error} />}
          {preview.payload && (
            <CopyBox
              label="Teste do Pix copia e cola (R$ 1,00)"
              value={preview.payload}
              hint="Cole no seu banco para conferir se o nome e o valor aparecem certos. Não pague."
            />
          )}
        </>
      )}
    </Card>
  );
}
