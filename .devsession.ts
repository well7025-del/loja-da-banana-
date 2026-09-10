import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomBytes } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const raw = randomBytes(32).toString("hex");
  const user = await prisma.user.findFirstOrThrow({ where: { email: "admin@lojadabanana.com.br" } });
  const expiresAt = new Date(Date.now() + 12 * 3600_000);
  await prisma.session.create({
    data: { userId: user.id, tokenHash: createHash("sha256").update(raw).digest("hex"), expiresAt },
  });
  const jwt = await new SignJWT({ sid: raw, uid: user.id })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(expiresAt).sign(secret);
  console.log(jwt);
}
main().finally(() => prisma.$disconnect());
