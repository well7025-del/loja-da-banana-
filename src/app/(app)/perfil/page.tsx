import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { datetime } from "@/lib/format";
import { Card, FormMessage, PageHeader, SectionTitle } from "@/components/ui";
import { ChangePasswordForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: { searchParams: Promise<{ trocar?: string }> }) {
  const user = (await getCurrentUser())!;
  const { trocar } = await searchParams;

  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { role: true },
  });

  return (
    <div>
      <PageHeader title="Minha conta" subtitle={user.email} />

      {(trocar === "1" || record.mustChangePassword) && (
        <div className="mb-3">
          <FormMessage error="Defina uma nova senha para continuar usando o sistema." />
        </div>
      )}

      <Card pad={false}>
        <div className="row"><span className="text-ink-500">Nome</span><span className="font-semibold">{record.name}</span></div>
        <div className="row"><span className="text-ink-500">E-mail</span><span className="font-semibold">{record.email}</span></div>
        <div className="row"><span className="text-ink-500">Perfil</span><span className="font-semibold">{record.role.name}</span></div>
        <div className="row"><span className="text-ink-500">Empresa</span><span className="font-semibold">{user.companyName}</span></div>
        <div className="row"><span className="text-ink-500">Último acesso</span><span className="font-semibold">{datetime(record.lastLoginAt)}</span></div>
      </Card>

      <SectionTitle>Alterar senha</SectionTitle>
      <ChangePasswordForm />

      <form action="/api/auth/logout" method="post" className="mt-6">
        <button type="submit" className="btn-ghost w-full !text-red-600">Sair do sistema</button>
      </form>
    </div>
  );
}
