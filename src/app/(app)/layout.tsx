import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { BottomNav, TopBar } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main className="mx-auto max-w-5xl px-4 py-4 pb-safe md:pb-10">{children}</main>
      <BottomNav user={user} />
    </div>
  );
}
