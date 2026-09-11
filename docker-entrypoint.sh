#!/bin/sh
# Prepara o banco na primeira subida e mantém o esquema em dia nas seguintes.
set -e

echo "→ Aguardando o banco de dados..."
until npx prisma db push --skip-generate --accept-data-loss >/dev/null 2>&1; do
  echo "   ainda não respondeu; tentando de novo em 3s"
  sleep 3
done
echo "✅ Esquema do banco aplicado."

echo "→ Criando as views de compatibilidade..."
psql "$DATABASE_URL" -f prisma/sql/views.sql >/dev/null 2>&1 || echo "   (views já existiam)"

# Semeia a estrutura inicial só uma vez.
if [ "$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM users" 2>/dev/null || echo 0)" = "0" ]; then
  echo "→ Primeira execução: criando empresa, perfis, catálogo e usuário administrador..."
  npx tsx prisma/seed.ts
else
  echo "→ Banco já inicializado."
fi

echo "→ Subindo o ERP na porta ${PORT:-3000}"
exec "$@"
