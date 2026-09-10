import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/server/services/settings";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { SettingsForm } from "./form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = (await getCurrentUser())!;
  if (!can(user.permissions, "settings.read")) redirect("/");
  const settings = await getSettings(user.companyId);

  return (
    <div>
      <PageHeader title="Configurações" subtitle="Parâmetros que alimentam preços, alertas e recomendações" />
      <SettingsForm settings={settings} readOnly={!can(user.permissions, "settings.update")} />

      <SectionTitle>Outras configurações</SectionTitle>
      <Card pad={false}>
        <Link href="/configuracoes/descontos" className="block active:bg-ink-50">
          <div className="row">
            <span className="font-medium text-ink-800">Política de descontos do atacado</span>
            <span className="text-ink-400">›</span>
          </div>
        </Link>
        {can(user.permissions, "users.read") && (
          <Link href="/usuarios" className="block active:bg-ink-50">
            <div className="row">
              <span className="font-medium text-ink-800">Usuários e permissões</span>
              <span className="text-ink-400">›</span>
            </div>
          </Link>
        )}
      </Card>
    </div>
  );
}
