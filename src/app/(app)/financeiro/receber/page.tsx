import { EntriesPage } from "../_entries";

export const dynamic = "force-dynamic";

export default async function ReceivablesPage({
  searchParams,
}: { searchParams: Promise<{ filtro?: string }> }) {
  const { filtro } = await searchParams;
  return (
    <EntriesPage
      direction="RECEIVABLE"
      filtro={filtro ?? "abertas"}
      title="Contas a receber"
      subtitle="Toque em um título para dar baixa"
    />
  );
}
