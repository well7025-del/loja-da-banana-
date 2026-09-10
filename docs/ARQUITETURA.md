# Loja da Banana — Arquitetura do ERP

Documento de referência do sistema: decisões de arquitetura, modelo de dados,
fluxos dos processos e plano de evolução.

---

## 1. Stack tecnológica

| Camada | Escolha | Por quê |
|---|---|---|
| Interface | **Next.js 15 (App Router) + React 19 + TypeScript** | Uma única base de código serve celular e computador. Renderização no servidor deixa o app rápido em 3G/4G, que é a realidade de quem usa o sistema no chão de fábrica. |
| Estilo | **Tailwind CSS** | Design system enxuto, sem CSS morto, com botões e áreas de toque grandes definidos uma vez em `globals.css`. |
| Banco | **PostgreSQL 16** | Relacional, transacional e gratuito. Aguenta o crescimento da empresa sem troca de tecnologia. |
| ORM | **Prisma** | Esquema versionado, tipagem ponta a ponta e transações seguras. |
| Autenticação | **Sessão própria: bcrypt + JWT assinado em cookie httpOnly** | Sem dependência de serviço externo e sem custo. Sessões ficam no banco e podem ser revogadas. |
| API | **Server Actions + Route Handlers** | Menos código intermediário: o formulário chama a regra de negócio diretamente, com validação e permissão no servidor. |
| Instalação no celular | **PWA** (manifest + ícone) | Vira ícone na tela inicial do Android sem passar por loja de aplicativos. |

### Por que não um app nativo agora

Um PWA cobre 100% das necessidades atuais (uso interno, conexão disponível,
sem hardware especial) com um terço do custo. Quando for necessário empacotar
para a Play Store, o mesmo código roda dentro de um contêiner nativo
(Capacitor/TWA) sem reescrever a aplicação — foi por isso que toda a lógica de
negócio ficou em `src/server/services`, isolada da interface.

---

## 2. Organização do código

```
prisma/
  schema.prisma          modelo de dados completo
  seed.ts                estrutura inicial (empresa, perfis, catálogo)
  seed-demo.ts           dados de demonstração, sempre marcados "DADOS DEMO"
  sql/views.sql          views de compatibilidade (production_batches, accounts_*)
src/
  lib/                   base: banco, dinheiro, autenticação, auditoria, códigos
  server/services/       REGRAS DE NEGÓCIO (sem UI)
    inventory.ts           estoque, custo médio, baixa por lote (FEFO)
    costing.ts             ficha técnica e formação de preço
    production.ts          ordens de produção, lotes, rendimento
    pricing.ts             motor de descontos configurável
    sales.ts               vendas, margem, contas a receber
    purchases.ts           compras, recebimento, custo com frete rateado
    finance.ts             contas, baixas, fluxo de caixa, inadimplência
    orders.ts              pedidos, reserva de estoque, kanban
    reports.ts             relatórios
    decisions.ts           Central de Decisões
    dashboard.ts           indicadores e alertas
  app/
    (app)/               telas autenticadas (uma pasta por módulo)
    actions/             server actions: validam, checam permissão e chamam os serviços
    api/                 rotas HTTP
  components/            biblioteca de interface reutilizável
scripts/verify.ts        teste das regras de negócio (48 verificações)
tests/fluxos.spec.ts     teste de ponta a ponta pela interface, em tela de celular
```

**Regra de ouro:** nenhuma tela calcula custo, margem ou saldo. Toda conta
acontece em `src/server/services`, em um único lugar, dentro de transação.

---

## 3. Modelo de dados

### 3.1 Decisões de modelagem

**Produto e matéria-prima na mesma tabela (`products`).** Banana, embalagem e
Banana Chips têm exatamente as mesmas necessidades: saldo, custo médio, lote,
validade e movimentação. Separar em duas tabelas obrigaria a duplicar estoque,
movimentos e custo. O campo `kind` distingue produto acabado, matéria-prima,
embalagem e revenda; os dados exclusivos de insumo (fornecedor preferencial,
unidade de compra, perda padrão) ficam na extensão 1:1 `raw_materials`.

**Um lote é um lote (`batches`).** Um lote produzido e um lote comprado são a
mesma entidade rastreável; o campo `origin` diferencia. A view SQL
`production_batches` expõe apenas os lotes de produção, atendendo a
nomenclatura pedida sem duplicar dados.

**Contas a pagar e a receber na mesma tabela (`finance_entries`).** As duas têm
os mesmos campos, o mesmo ciclo de vida e as mesmas baixas parciais. O campo
`direction` diferencia, e as views `accounts_payable` / `accounts_receivable`
expõem cada lado separadamente.

**Preparado para crescer desde o primeiro dia.** Toda tabela operacional carrega
`companyId`, e movimentos e saldos carregam `warehouseId`. Abrir uma segunda
loja, um centro de distribuição ou uma segunda empresa é cadastro, não
reescrita.

### 3.2 Tabelas

| Grupo | Tabelas |
|---|---|
| Organização | `companies`, `warehouses`, `settings` |
| Acesso | `roles`, `users`, `sessions`, `audit_logs` |
| Cadastros | `categories`, `products`, `raw_materials`, `customers`, `suppliers` |
| Ficha técnica | `recipes`, `recipe_items` |
| Produção | `production_orders`, `production_consumptions`, `batches` (+ view `production_batches`) |
| Estoque | `inventory`, `inventory_movements` |
| Vendas | `sales`, `sale_items`, `orders`, `order_items` |
| Compras | `purchase_orders`, `purchase_items` |
| Financeiro | `finance_entries` (+ views `accounts_payable`, `accounts_receivable`), `payments`, `finance_categories`, `expenses` |
| Comercial | `price_rules` |

### 3.3 Relacionamentos principais

```
Company ──< Warehouse ──< Inventory >── Product
                 │                          │
                 └──< InventoryMovement >───┤
                          │                 │
                        Batch >─────────────┤
                          │                 │
              ProductionOrder ──< ProductionConsumption
                          │
                       Recipe ──< RecipeItem >── Product

Customer ──< Order ──< OrderItem >── Product
    │           │
    │         Sale ──< SaleItem >── Product
    └──────────┴──< FinanceEntry ──< Payment
                        │
Supplier ──< PurchaseOrder ──< PurchaseItem >── Product
```

### 3.4 Precisão numérica

Dinheiro usa `Decimal(14,2)`; quantidades e custos unitários usam
`Decimal(18,6)`. Nenhum valor monetário passa por ponto flutuante — o custo
médio precisa de 6 casas para não acumular erro ao longo de centenas de
entradas.

---

## 4. Fluxos dos processos

### 4.1 Compra → estoque → custo médio

```
Registrar compra
   └─ escolhe fornecedor e itens, informa frete
Receber mercadoria
   ├─ cria o LOTE (com validade)
   ├─ rateia o frete no custo de cada item, proporcional ao valor
   ├─ dá entrada no estoque
   ├─ RECALCULA O CUSTO MÉDIO PONDERADO
   │     novo = (qtd_anterior × custo_anterior + qtd_entrada × custo_entrada)
   │             ÷ (qtd_anterior + qtd_entrada)
   └─ gera a CONTA A PAGAR
```

O custo médio recalculado alimenta automaticamente todas as fichas técnicas
que usam aquele insumo, e portanto o custo e a margem de cada produto.

### 4.2 Produção

```
Nova produção
   ├─ escolhe o produto e a quantidade
   ├─ o sistema EXPLODE A FICHA TÉCNICA e mostra a matéria-prima necessária,
   │  já considerando a perda de cada ingrediente e avisando o que falta
   └─ inicia
Finalizar
   ├─ informa o produzido e as perdas (o consumo real pode ser ajustado)
   ├─ BAIXA a matéria-prima pelo custo médio, consumindo o lote que vence antes
   ├─ GERA O LOTE  LB-AAAAMMDD-000  com validade calculada
   ├─ DÁ ENTRADA do produto acabado, atualizando o custo médio
   ├─ APURA O CUSTO REAL (matéria-prima + mão de obra + energia + outros)
   └─ APURA O RENDIMENTO REAL sobre o ingrediente principal
        100 kg de banana → 30 kg de chips = 30%
```

### 4.3 Venda

```
Nova venda
   ├─ varejo ou atacado (define a tabela de preço)
   ├─ busca o produto e toca para adicionar; +/- ajusta a quantidade
   ├─ o DESCONTO É APLICADO SOZINHO pela política cadastrada
   └─ escolhe a forma de pagamento
Finalizar
   ├─ BAIXA o estoque pelo lote mais próximo do vencimento (FEFO)
   ├─ calcula custo, lucro bruto e margem da venda
   ├─ à vista: título já quitado (entra no fluxo de caixa)
   ├─ a prazo: parcelas em aberto, respeitando o LIMITE DE CRÉDITO do cliente
   └─ numera a venda  VD-AAAAMMDD-000
```

### 4.4 Pedido (B2B)

```
NOVO → CONFIRMADO → EM SEPARAÇÃO → EM PRODUÇÃO → PRONTO → DESPACHADO → ENTREGUE
        └── a partir daqui o estoque fica RESERVADO ──┘
Faturar → gera a venda, libera a reserva e baixa o estoque de verdade
```

### 4.5 Formação de preço

Método do divisor, para que a margem informada seja margem de verdade:

```
Preço = custo ÷ (1 − (impostos% + despesas fixas% + comissão% + cartão% + margem%) ÷ 100)

Preço mínimo   = mesma conta com margem 0  (abaixo disso a venda dá prejuízo)
```

---

## 5. Segurança

- Senhas com **bcrypt** (fator 11). Nunca em texto puro, nunca reversíveis.
- Sessão em **cookie httpOnly + SameSite=Lax**, assinada com JWT e registrada no
  banco — dá para revogar o acesso de alguém na hora.
- **Bloqueio por tentativas**: 5 senhas erradas travam a conta por 15 minutos.
- **Autorização por perfil** verificada no servidor em toda ação
  (`requirePermission`), não apenas escondendo botões na tela.
- **Validação e regra de negócio no servidor**: estoque insuficiente, limite de
  crédito estourado e valor inválido são barrados na fonte.
- **Auditoria automática** de criação, alteração, exclusão, login e logout.
- **Exclusão lógica** (`deletedAt`) nos cadastros — o histórico nunca some.
- Cabeçalhos `X-Frame-Options`, `X-Content-Type-Options` e `Referrer-Policy`.
- **Backup** com `npm run db:backup` (`pg_dump` compactado em `backups/`).

---

## 6. Perfis de acesso

| Perfil | Enxerga |
|---|---|
| Administrador | Tudo, inclusive usuários e configurações |
| Gerente | Toda a operação, sem gestão de usuários |
| Produção | Produção, fichas técnicas e estoque |
| Estoque | Entradas, saídas, ajustes e recebimento de compras |
| Vendas | Vendas, pedidos e clientes |
| Financeiro | Contas, fluxo de caixa e precificação |

As permissões ficam na tabela `roles` como lista (`estoque.create`, `vendas.*`,
`*`), então dá para ajustar sem mexer no código.

---

## 7. Como as recomendações são calculadas

A Central de Decisões não usa nenhum número inventado. Cada recomendação tem
uma origem verificável:

| Recomendação | Base do cálculo |
|---|---|
| Produzir X kg | Estoque abaixo do mínimo + venda média diária dos últimos 30 dias × dias de cobertura |
| Comprar X kg | Estoque abaixo do mínimo + consumo médio na produção nos últimos 30 dias |
| Insumo subiu/caiu Y% | Preço médio de compra dos últimos 30 dias contra os 90 dias anteriores |
| Produto cresceu/caiu Y% | Faturamento dos últimos 30 dias contra os 30 anteriores |
| Maior/menor margem | Faturamento menos custo real (custo médio na data da venda) por produto |
| Preço abaixo do mínimo | Preço de tabela comparado ao preço mínimo calculado |
| Cliente sem comprar há N dias | Data da última venda concluída |
| Estoque parado | Nenhum movimento nos últimos 60 dias com saldo em mãos |
| Rendimento caiu | Última produção abaixo de 90% da média das últimas |

Os parâmetros (dias de cobertura, dias para considerar um cliente inativo etc.)
ficam em **Configurações**.

---

## 8. Plano de desenvolvimento e situação

| Etapa | Entrega | Situação |
|---|---|---|
| 1 | Arquitetura e banco de dados | ✅ |
| 2 | Autenticação, perfis e usuários | ✅ |
| 3 | Dashboard com indicadores, alertas e atalhos | ✅ |
| 4 | Produtos e matérias-primas | ✅ |
| 5 | Estoque, lotes, validade e rastreabilidade | ✅ |
| 6 | Ficha técnica e custo | ✅ |
| 7 | Produção, lotes e rendimento | ✅ |
| 8 | Vendas, clientes e pedidos | ✅ |
| 9 | Compras e fornecedores | ✅ |
| 10 | Financeiro e fluxo de caixa | ✅ |
| 11 | Relatórios | ✅ |
| 12 | Central de Decisões | ✅ |

### Próximos passos sugeridos

1. Preencher preços, custos e estoques mínimos reais nos cadastros.
2. Montar a ficha técnica de cada produto com as quantidades reais da fábrica.
3. Fazer o inventário inicial (Estoque → Ajuste).
4. Cadastrar os usuários da equipe com o perfil certo.
5. Rodar uma semana em paralelo com o controle atual para conferir os números.

### Evoluções naturais

- Leitura de código de barras pela câmera (a busca já aceita o código digitado).
- Emissão de NF-e via integração com provedor fiscal.
- Envio de cobrança e catálogo por WhatsApp (os links já existem nas telas).
- Múltiplos estoques na interface (o banco já suporta).
- Aplicativo Android empacotado a partir do mesmo código.
