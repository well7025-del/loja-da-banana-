import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { datetime } from "@/lib/format";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import { UsersManager } from "./manager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const current = (await getCurrentUser())!;
  if (!can(current.permissions, "users.read")) redirect("/");

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      where: { companyId: current.companyId },
      include: { role: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Usuários e permissões" subtitle={`${users.filter((u) => u.active).length} ativo(s)`} />

      <UsersManager
        users={users.map((u) => ({
          id: u.id, name: u.name, email: u.email, phone: u.phone,
          roleId: u.roleId, roleName: u.role.name, active: u.active,
          lastLoginAt: u.lastLoginAt ? datetime(u.lastLoginAt) : null,
          isSelf: u.id === current.id,
        }))}
        roles={roles.map((r) => ({ id: r.id, name: r.name, description: r.description }))}
        canEdit={can(current.permissions, "users.update")}
        canCreate={can(current.permissions, "users.create")}
        canDelete={can(current.permissions, "users.delete")}
      />

      <SectionTitle>O que cada perfil enxerga</SectionTitle>
      <Card pad={false}>
        {roles.map((role) => (
          <div key={role.id} className="border-b border-[var(--border)] px-4 py-3 last:border-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-ink-900">{role.name}</p>
              {role.permissions.includes("*") && <Badge tone="green">acesso total</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-ink-500">{role.description}</p>
            {!role.permissions.includes("*") && (
              <p className="mt-1.5 text-xs text-ink-400">
                Módulos: {[...new Set(role.permissions.map((p) => p.split(".")[0]))].join(", ")}
              </p>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
