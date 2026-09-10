"use client";

import { useState } from "react";
import { ActionForm, ConfirmForm } from "@/components/forms";
import { Badge, Card, Field } from "@/components/ui";
import { deactivateUserAction, saveUserAction } from "@/app/actions/admin";

type UserRow = {
  id: string; name: string; email: string; phone: string | null;
  roleId: string; roleName: string; active: boolean; lastLoginAt: string | null; isSelf: boolean;
};

export function UsersManager({
  users, roles, canEdit, canCreate, canDelete,
}: {
  users: UserRow[];
  roles: { id: string; name: string; description: string | null }[];
  canEdit: boolean; canCreate: boolean; canDelete: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-3">
      {users.map((user) => (
        <Card key={user.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink-900">{user.name}</span>
                {!user.active && <Badge tone="red">inativo</Badge>}
                {user.isSelf && <Badge tone="blue">você</Badge>}
              </div>
              <p className="truncate text-sm text-ink-500">{user.email}</p>
              <p className="mt-0.5 text-xs text-ink-500">
                {user.roleName}
                {user.lastLoginAt ? ` · último acesso ${user.lastLoginAt}` : " · nunca acessou"}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => { setEditing(editing === user.id ? null : user.id); setCreating(false); }}
                  className="btn-ghost btn-sm"
                >
                  {editing === user.id ? "Fechar" : "Editar"}
                </button>
              )}
              {canDelete && user.active && !user.isSelf && (
                <ConfirmForm
                  action={deactivateUserAction} id={user.id} label="Desativar"
                  question={`Desativar ${user.name}? As sessões abertas serão encerradas.`}
                />
              )}
            </div>
          </div>
          {editing === user.id && (
            <div className="mt-3 border-t border-[var(--border)] pt-3">
              <UserForm user={user} roles={roles} onDone={() => setEditing(null)} />
            </div>
          )}
        </Card>
      ))}

      {canCreate && (
        creating ? (
          <Card>
            <p className="mb-2 font-semibold text-ink-900">Novo usuário</p>
            <UserForm roles={roles} onDone={() => setCreating(false)} />
          </Card>
        ) : (
          <button type="button" onClick={() => { setCreating(true); setEditing(null); }} className="btn-banana w-full">
            + Novo usuário
          </button>
        )
      )}
    </div>
  );
}

function UserForm({
  user, roles, onDone,
}: { user?: UserRow; roles: { id: string; name: string; description: string | null }[]; onDone: () => void }) {
  return (
    <ActionForm
      action={saveUserAction}
      submitLabel="Salvar usuário"
      footer={<button type="button" onClick={onDone} className="btn-ghost w-full">Cancelar</button>}
    >
      {user && <input type="hidden" name="id" value={user.id} />}
      <Field label="Nome" required>
        <input name="name" className="input" defaultValue={user?.name ?? ""} required />
      </Field>
      <Field label="E-mail" required>
        <input name="email" type="email" className="input" autoCapitalize="none" defaultValue={user?.email ?? ""} required />
      </Field>
      <Field label="Telefone">
        <input name="phone" type="tel" className="input" inputMode="tel" defaultValue={user?.phone ?? ""} />
      </Field>
      <Field label="Perfil de acesso" required>
        <select name="roleId" className="input" defaultValue={user?.roleId ?? ""} required>
          <option value="">Selecione</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Field>
      <Field
        label={user ? "Nova senha" : "Senha inicial"}
        hint={user ? "Deixe vazio para manter a senha atual" : "Mínimo de 8 caracteres — o usuário troca no primeiro acesso"}
        required={!user}
      >
        <input name="password" type="password" className="input" autoComplete="new-password" minLength={user ? 0 : 8} />
      </Field>
      <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
        <input type="checkbox" name="active" defaultChecked={user?.active ?? true} className="h-5 w-5 rounded" />
        Usuário ativo
      </label>
    </ActionForm>
  );
}
