import { EntriesPage } from "../_entries";

export const dynamic = "force-dynamic";

export default async function PayablesPage({
  searchParams,
}: { searchParams: Promise<{ filtro?: string }> }) {
  const { filtro } = await searchParams;
  return (
    <EntriesPage
      direction="PAYABLE"
      filtro={filtro ?? "abertas"}
      title="Contas a pagar"
      subtitle="Toque em um título para registrar o pagamento"
    />
  );
}
