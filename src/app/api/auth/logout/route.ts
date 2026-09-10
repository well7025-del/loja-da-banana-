import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user) await audit({ user, action: "LOGOUT", entity: "User", entityId: user.id, summary: "Saiu do sistema" });
  await destroySession();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
