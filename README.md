# 🍌 Loja da Banana — ERP

Sistema de gestão da Loja da Banana: **produção, estoque, vendas, compras e
financeiro**, feito primeiro para o celular e também responsivo no computador.

> Não é protótipo. Tem banco de dados, regras de negócio, cálculo de custo,
> controle de lote e persistência real.

---

## O que o sistema resolve

| Pergunta do dia a dia | Onde responder |
|---|---|
| Quanto vendi hoje e no mês? | Início |
| Quanto ganhei? | Início → Lucro estimado |
| Quanto tenho em estoque? | Estoque |
| O que preciso produzir? | Central de Decisões 🍌 |
| O que preciso comprar? | Central de Decisões 🍌 |
| Quem está me devendo? | Financeiro → A receber |
| Quanto tenho para pagar? | Financeiro → A pagar |
| Qual produto dá mais lucro? | Relatórios → Lucro e margem |

---

## Colocar para rodar

Pré-requisitos: **Node.js 20+** e **PostgreSQL 14+**.

```bash
# 1. dependências
npm install

# 2. configuração
cp .env.example .env
#    edite DATABASE_URL e gere um AUTH_SECRET forte:
#    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. banco de dados
npm run db:push                      # cria as tabelas
psql "$DATABASE_URL" -f prisma/sql/views.sql   # views de compatibilidade
npm run db:seed                      # empresa, perfis, catálogo e usuário admin

# 4. subir
npm run dev                          # http://localhost:3000
```

**Primeiro acesso:** `admin@lojadabanana.com.br` / `LojaDaBanana@2026`
O sistema exige a troca da senha no primeiro login.

### Instalar no celular Android

Abra o endereço do sistema no Chrome → menu → **Adicionar à tela inicial**.
O app abre em tela cheia, com ícone próprio, como um aplicativo.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Ambiente de desenvolvimento |
| `npm run build` / `npm start` | Build e execução em produção |
| `npm run db:push` | Aplica o esquema no banco |
| `npm run db:seed` | Cria a estrutura inicial (sem dados fictícios) |
| `npm run db:seed:demo` | Cria **DADOS DEMO** para conhecer o sistema |
| `npm run db:seed:demo -- --limpar` | Remove os dados de demonstração |
| `npm run db:studio` | Navegador visual do banco |
| `npm run db:backup` | Backup compactado em `backups/` |
| `npm run verify` | Testa as regras de negócio (48 verificações) |
| `npm run test:e2e` | Testa a interface em tela de celular |
| `npm run typecheck` | Verificação de tipos |

### Sobre os dados de demonstração

O seed principal cria **apenas a estrutura**: a empresa, os perfis de acesso,
as categorias financeiras, o catálogo de produtos e insumos citados pela
empresa e as faixas de desconto do atacado. **Preços, custos e saldos nascem
zerados** — devem ser preenchidos com os números reais.

Dados fictícios ficam no comando separado `npm run db:seed:demo` e são sempre
identificados com o prefixo **"DADOS DEMO"** na tela, para nunca serem
confundidos com informação real da empresa.

---

## Módulos

**Início** — vendas do dia e do mês, lucro estimado, contas a pagar e receber,
pedidos em aberto, estoque crítico, produção do dia, alertas e atalhos grandes
para as sete operações mais frequentes.

**Vendas** — tela de venda rápida: busca o produto, um toque adiciona, `+`/`−`
ajusta a quantidade, escolhe a forma de pagamento e finaliza. O desconto de
atacado é aplicado sozinho, o estoque baixa pelo lote mais próximo do
vencimento e o título financeiro é gerado.

**Pedidos** — quadro Kanban do pedido B2B: Novo → Confirmado → Em separação →
Em produção → Pronto → Despachado → Entregue. Reserva o estoque e fatura em um
toque.

**Produção** — escolhe o produto e a quantidade; o sistema explode a ficha
técnica, mostra a matéria-prima necessária e avisa o que falta. Ao finalizar,
baixa os insumos, gera o lote `LB-AAAAMMDD-000`, dá entrada no produto acabado
e apura custo e rendimento reais.

**Estoque** — entrada, saída, ajuste de inventário, lotes com validade,
rastreabilidade completa (de qual matéria-prima veio cada lote e para onde ele
foi) e ficha de movimentação por item.

**Fichas técnicas** — ingredientes, perdas, rendimento, mão de obra e energia,
com o custo recalculado em tempo real conforme o custo médio das compras.

**Compras** — pedido ao fornecedor, recebimento com lote e validade, frete
rateado no custo e conta a pagar gerada automaticamente.

**Financeiro** — contas a pagar e a receber com baixa parcial, fluxo de caixa
dia a dia, despesas por categoria e lista de clientes inadimplentes.

**Central de Decisões 🍌** — analisa os dados reais e recomenda o que produzir,
o que comprar, quais preços revisar e quais clientes retomar.

**Relatórios** — 15 relatórios com filtro por hoje, semana, mês, ano ou período
personalizado.

**Administração** — usuários com seis perfis de acesso, política de descontos
configurável, parâmetros de preço e alertas, e trilha de auditoria.

---

## Regras de negócio que o sistema garante

- **Custo médio ponderado**: 100 kg a R$ 4 + 100 kg a R$ 5 = R$ 4,50/kg,
  recalculado a cada entrada e propagado para todas as fichas técnicas.
- **Baixa FEFO**: sai primeiro o lote que vence antes.
- **Rendimento real**: 100 kg de banana que geram 30 kg de chips = 30%,
  comparado com o previsto e com a média histórica.
- **Preço mínimo**: `custo ÷ (1 − encargos%)`. Abaixo disso a venda dá prejuízo,
  e o sistema avisa.
- **Limite de crédito**: venda a prazo é bloqueada se estourar o limite.
- **Estoque insuficiente**: a venda é bloqueada (configurável).
- **Exclusão lógica**: cadastros são inativados, nunca apagados.

---

## Segurança

Senhas com bcrypt, sessão em cookie httpOnly assinado e revogável, bloqueio
após 5 tentativas, autorização por perfil verificada no servidor em toda ação,
auditoria automática e backup por comando. Detalhes em
[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

---

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — arquitetura, modelo de dados,
  fluxos dos processos e plano de desenvolvimento.
- [`docs/MANUAL.md`](docs/MANUAL.md) — manual de uso para a equipe.
