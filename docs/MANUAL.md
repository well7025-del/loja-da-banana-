# Manual de uso — Loja da Banana

Guia direto para a equipe. Cada tarefa em poucos toques.

---

## Entrar no sistema

1. Abra o endereço do sistema no celular.
2. No Chrome: menu (⋮) → **Adicionar à tela inicial**. Vira um app.
3. Entre com seu e-mail e senha. No primeiro acesso o sistema pede uma senha nova.

O menu de baixo tem tudo que você usa no dia a dia:

🏠 Início · 🛒 Vendas · 🏭 Produção · 📦 Estoque · 💰 Financeiro · ☰ Mais

---

## Registrar uma venda (menos de 20 segundos)

1. Início → **NOVA VENDA**.
2. Escolha **Varejo** ou **Atacado**.
3. (Opcional) escolha o cliente. No balcão pode deixar em branco.
4. Digite parte do nome do produto e **toque nele** — entra com quantidade 1.
5. Use **+** e **−** para ajustar, ou toque no número e digite.
6. Toque na forma de pagamento (Pix, Dinheiro, Cartão, Transferência, A prazo).
7. **FINALIZAR VENDA**.

O desconto de atacado entra sozinho conforme a política cadastrada. O estoque
baixa na hora e o título financeiro é criado.

> **A prazo** exige cliente cadastrado. Se o cliente já deve mais que o limite
> de crédito, o sistema bloqueia e avisa.

---

## Registrar uma produção (menos de 30 segundos)

1. Início → **REGISTRAR PRODUÇÃO**.
2. Escolha o produto e digite quanto vai produzir.
3. O sistema mostra **quanta matéria-prima é necessária** e avisa se falta algo.
4. **INICIAR PRODUÇÃO**.

Quando terminar a produção:

5. Digite **quanto saiu de verdade** e as **perdas**.
6. Se o consumo foi diferente do previsto, toque em *Ajustar consumo real*.
7. **FINALIZAR PRODUÇÃO**.

O sistema faz sozinho: baixa a matéria-prima, gera o lote `LB-AAAAMMDD-000`
com validade, dá entrada no produto acabado, calcula o custo real por quilo e
calcula o rendimento (ex.: 100 kg de banana → 30 kg de chips = 30%).

---

## Entrada de estoque

Início → **ENTRADA DE ESTOQUE** → busque o produto → quantidade → custo
unitário → registrar.

O **custo unitário é importante**: é ele que recalcula o custo médio e, com
isso, o custo e a margem dos produtos que usam esse insumo.

Para itens com lote, informe a validade (ou deixe o sistema calcular pelo prazo
cadastrado no produto).

---

## Compras

**Mais → Compras → + Comprar**

1. Escolha o fornecedor.
2. Adicione os itens com quantidade e preço de compra.
3. Informe frete e vencimento.
4. Marque **"Já recebi a mercadoria"** se a entrega foi no ato.
5. Registrar.

Ao receber: o lote é criado, o frete é rateado no custo de cada item, o custo
médio é recalculado e a **conta a pagar é gerada automaticamente**.

Se a mercadoria vem depois, deixe a marcação desligada e use o botão
**Receber mercadoria** na tela da compra quando ela chegar.

---

## Contas a pagar e a receber

**Financeiro → A receber** (ou **A pagar**) → **toque no título** → confirme o
valor e a forma → confirmar.

Aceita **baixa parcial**: mudou o valor, o título fica como "Parcial" e o saldo
continua em aberto.

Filtros no topo: Em aberto · Vencidas · Quitadas.

---

## Pedidos (venda para loja e distribuidor)

**Mais → Pedidos → + Pedido**

O pedido anda por um quadro que você arrasta com o dedo para o lado:

`Novo → Confirmado → Em separação → Em produção → Pronto → Despachado → Entregue`

A partir de **Confirmado**, o estoque fica **reservado** — não some, mas também
não pode ser vendido em outro lugar.

Quando entregar, toque em **Faturar pedido**: o sistema gera a venda, baixa o
estoque de verdade e cria o título financeiro.

---

## Ficha técnica (receita)

**Mais → Fichas técnicas → + Nova**

1. Escolha o produto fabricado.
2. Informe o **rendimento esperado** (quanto sai da receita).
3. Adicione os ingredientes e embalagens com as quantidades.
4. Marque o **ingrediente principal** (a banana, por exemplo) — é ele que serve
   de base para o cálculo de rendimento.
5. Informe perdas por ingrediente (ex.: 30% de casca), mão de obra e energia.

O custo aparece calculado na hora e se atualiza sozinho toda vez que o preço de
compra dos insumos mudar.

---

## Formação de preço

**Mais → Formação de preço**

Escolha o produto: o custo vem da ficha técnica. Ajuste impostos, despesas
fixas, comissão, taxa de cartão e a margem desejada.

O sistema mostra:

- **Preço mínimo** — abaixo disso a venda dá prejuízo.
- **Preço recomendado** — cobre tudo e entrega a margem que você pediu.
- **Margem real do preço que você pratica hoje.**

Para gravar o novo preço, edite o produto em **Produtos**.

---

## Central de Decisões 🍌

**Mais → Central de Decisões**

Mostra o que os números estão dizendo, em ordem de urgência:

- ⚠️ o que está abaixo do estoque mínimo e **quanto produzir**
- 📦 **quanto comprar** de cada insumo
- ⚠️ quais insumos subiram de preço no último mês
- 📈 quais produtos estão crescendo e quais estão caindo
- 💰 qual produto tem a melhor margem
- 🚨 qual produto está sendo vendido abaixo do preço mínimo
- 👤 quais clientes pararam de comprar
- ⚗️ quando o rendimento de uma produção caiu

Cada recomendação tem um botão que leva direto para a ação.

---

## Relatórios

**Mais → Relatórios.** Todo relatório tem filtro de **Hoje / Semana / Mês / Ano
/ Período**.

Vendas por período, por produto, por cliente e por vendedor · Lucro e margem ·
Estoque e estoque parado · Perdas · Produção e rendimento · Compras e
fornecedores · Contas a pagar e a receber · Fluxo de caixa.

---

## Perfis de acesso

Cada pessoa vê só o que precisa:

| Perfil | Vê |
|---|---|
| **Administrador** | Tudo |
| **Gerente** | Toda a operação, menos usuários |
| **Produção** | Produção, fichas técnicas e estoque |
| **Estoque** | Entradas, saídas, ajustes e recebimentos |
| **Vendas** | Vendas, pedidos e clientes |
| **Financeiro** | Contas, fluxo de caixa e preços |

Administrador cadastra em **Mais → Usuários e permissões**.

---

## Dúvidas comuns

**Errei uma venda.** Abra a venda → **Cancelar venda** → informe o motivo. O
estoque volta e os títulos em aberto são cancelados. Nada é apagado: fica tudo
registrado.

**O estoque não bate com a contagem.** Estoque → **Ajuste** → escolha o item →
digite a quantidade contada. O sistema registra a diferença com seu nome.

**Não consigo vender, diz que falta estoque.** É proteção. Confira o saldo em
Estoque; se estiver errado, faça o ajuste. Se você realmente quiser permitir
venda sem saldo, o administrador libera em Configurações.

**De onde veio esse lote?** Estoque → Lotes → toque no lote. Mostra a produção
de origem, a matéria-prima usada, o responsável e todas as saídas.

**Quem alterou esse cadastro?** Mais → Auditoria. Registra quem criou, alterou,
excluiu, quando e o quê.
