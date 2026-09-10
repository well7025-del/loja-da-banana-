import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/api/auth", "/manifest.webmanifest", "/icon.svg"];

/**
 * Barreira barata na borda: sem cookie de sessão, nem chega ao banco.
 * A validação de verdade (assinatura, expiração, revogação) acontece em
 * `getCurrentUser`, no servidor — este middleware é só o primeiro filtro.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((path) => pathname.startsWith(path))) return NextResponse.next();

  if (!request.cookies.get("lb_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
