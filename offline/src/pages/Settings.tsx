import { useEffect, useState } from "react";
import { SETTING_LABELS, type CompanySettings } from "@/lib/defaults";
import { getSettings, saveSettings } from "@/logic/settings";
import { resetEverything } from "@/logic/seed";
import { Busy, Card, Field, Message, PageHeader, SectionTitle, Spinner } from "@/components/ui";

const PRICING: (keyof CompanySettings)[] = [
  "taxPct", "fixedOverheadPct", "commissionPct", "cardFeePct", "defaultTargetMarginPct",
];
const ALERTS: (keyof CompanySettings)[] = [
  "expiryAlertDays", "inactiveCustomerDays", "productionCoverageDays", "purchaseCoverageDays",
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
