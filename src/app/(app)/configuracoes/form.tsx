"use client";

import { ActionForm } from "@/components/forms";
import { Card, Field } from "@/components/ui";
import { saveSettingsAction } from "@/app/actions/admin";
import { SETTING_LABELS, type CompanySettings } from "@/lib/defaults";

const PRICING_KEYS: (keyof CompanySettings)[] = [
  "taxPct", "fixedOverheadPct", "commissionPct", "cardFeePct", "defaultTargetMarginPct",
];
const ALERT_KEYS: (keyof CompanySettings)[] = [
  "expiryAlertDays", "inactiveCustomerDays", "productionCoverageDays", "purchaseCoverageDays",
];

export function SettingsForm({ settings, readOnly }: { settings: CompanySettings; readOnly: boolean }) {
  if (readOnly) {
    return (
      <Card pad={false}>
        {[...PRICING_KEYS, ...ALERT_KEYS].map((key) => (
          <div key={key} className="row">
            <span className="text-ink-600">{SETTING_LABELS[key].label}</span>
            <span className="font-semibold tabular-nums">{settings[key]}{SETTING_LABELS[key].suffix ?? ""}</span>
          </div>
        ))}
      </Card>
    );
  }

  return (
    <ActionForm action={saveSettingsAction} submitLabel="Salvar parâmetros">
      <Card className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Formação de preço</p>
        <div className="grid grid-cols-2 gap-3">
          {PRICING_KEYS.map((key) => (
            <Field key={key} label={SETTING_LABELS[key].label} hint={SETTING_LABELS[key].help}>
              <input name={key} className="input" inputMode="decimal" defaultValue={settings[key]} />
            </Field>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Alertas e recomendações</p>
        <div className="grid grid-cols-2 gap-3">
          {ALERT_KEYS.map((key) => (
            <Field key={key} label={SETTING_LABELS[key].label} hint={SETTING_LABELS[key].help}>
              <input name={key} className="input" inputMode="numeric" defaultValue={settings[key]} />
            </Field>
          ))}
        </div>
        <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
          <input
            type="checkbox" name="allowNegativeStock"
            defaultChecked={settings.allowNegativeStock === "true"} className="h-5 w-5 rounded"
          />
          Permitir venda sem saldo em estoque
        </label>
      </Card>
    </ActionForm>
  );
}
