# Loja da Banana — versão local (um único celular)

Esta versão roda **inteira dentro do celular**. Não precisa de servidor, de
computador ligado nem de internet. Os dados ficam no próprio aparelho.

> São dois aplicativos diferentes, que podem conviver no mesmo celular:
>
> | | Onde ficam os dados | Precisa de internet | Vários celulares |
> |---|---|---|---|
> | **Loja da Banana** (local) | No próprio celular | Não | Não — cada celular tem seus dados |
> | **Loja da Banana (rede)** | Num servidor | Sim, na rede | Sim, todos veem o mesmo |
>
> **Os dados não são compartilhados entre os dois.** São bases separadas.

---

## Instalar

1. Gere o instalador: repositório no GitHub → aba **Actions** →
   **"Gerar APK do aplicativo"** → **Run workflow** (deixe em `ambos` ou
   escolha `local`).
2. Baixe em **Artifacts → loja-da-banana-apk**. Dentro do `.zip` está o
   `loja-da-banana-LOCAL-1.1.0.apk`.
3. **Antes de instalar, desinstale qualquer "Loja da Banana" que já esteja no
   celular.** As versões anteriores têm o mesmo nome e o mesmo ícone: com as
   duas instaladas é fácil abrir a errada sem perceber.
4. Envie para o celular e toque no arquivo. O Android vai avisar que o app não
   veio da Play Store — autorize "Instalar apps desconhecidos" para o
   aplicativo que abriu o arquivo.

### Instalei e abriu uma tela pedindo "Endereço do servidor"

Então o que está aberto é o aplicativo **de rede**, não o local. O aplicativo
local nunca pede endereço nenhum: ele abre direto no painel.

Como acontece: os dois aplicativos usam o mesmo ícone, e as versões geradas
antes da separação também se chamavam só "Loja da Banana". O que resolve:

1. Desinstale **todos** os "Loja da Banana" do celular.
2. Instale apenas o arquivo cujo nome contém **LOCAL**.
3. Confirme em *Configurações → Aplicativos*: o local aparece como
   `com.lojadabanana.erp.local` (ou `...local.debug`, se o APK não foi
   assinado com chave própria).

Cada execução do workflow imprime, no passo **"Conferir a identidade de cada
instalador"**, o pacote, o nome e a tela inicial de cada APK gerado — e falha
de propósito se um deles sair trocado ou sem a interface embutida.

### "App não instalado" ao atualizar

Enquanto não houver chave de assinatura própria configurada (`KEYSTORE_BASE64`
nos segredos do repositório — ver `docs/INSTALACAO.md`), cada compilação sai
com uma assinatura diferente, e o Android recusa instalar por cima. Para
atualizar: **faça o backup, desinstale, instale o novo APK e restaure**. Com a
chave própria configurada, a atualização passa a funcionar por cima, sem
desinstalar e sem perder nada.

### Antes de usar: três ajustes de 2 minutos

Em **Mais → Configurações**:

1. **Dados da loja** — nome, endereço e WhatsApp. É o que sai no comprovante
   e no catálogo.
2. **Recebimento por Pix** — ligue a opção e preencha chave, beneficiário e
   cidade. Use o botão de teste para conferir antes da primeira venda.
3. **Preços e comissão de cada produto** — em Mais → Produtos.

Ao abrir pela primeira vez, o app já vem com o catálogo de produtos e insumos
da empresa e com as faixas de desconto do atacado. **Preços, custos e estoques
nascem zerados** — nada é inventado; preencha com os números reais.

---

## Backup — leia antes de começar a usar

Os dados moram no celular. Se o aparelho quebrar, for roubado ou o aplicativo
for desinstalado sem cópia, **a informação vai junto**. Por isso o backup tem
duas camadas:

### 1. Automático, pelo Android (já ligado)

O Android copia os dados do aplicativo para a sua conta Google
periodicamente, sozinho, quando o celular está carregando e no Wi-Fi. Ao
reinstalar o app no mesmo aparelho ou configurar um celular novo com a mesma
conta, os dados voltam.

Não precisa configurar nada. Duas limitações honestas:

- Você não escolhe a data nem consegue abrir essa cópia — ela é do sistema.
- O Android não garante a frequência; pode passar dias sem copiar.

Por isso ela **não substitui** o backup manual.

### 2. Manual, em arquivo (o que você controla)

**Menu inferior → Mais → Backup**, ou o botão **Backup** no topo.

- **Salvar no Google Drive** — gera o arquivo e abre o menu do Android; toque
  em **Drive**. Se o Drive não aparecer, instale o aplicativo do Google Drive.
- **Salvar em uma pasta do celular** — você escolhe onde gravar.

O arquivo tem **tudo**: produtos, estoque, lotes, movimentações, fichas
técnicas, produções, clientes, vendas, títulos financeiros, inventários,
extratos conferidos, os **documentos anexados** e as configurações.

> Os anexos (fotos de produto, autorizações, notas) viajam dentro do backup.
> Por isso cada arquivo anexado é limitado a 2 MB e as fotos são reduzidas
> automaticamente antes de serem guardadas.

O app mostra um aviso no topo quando o backup está atrasado. O prazo é
ajustável na própria tela de Backup (1, 3, 7, 15 ou 30 dias). O padrão é 7.

**Faça um backup manual antes de:** trocar de celular, atualizar o aplicativo,
ou mexer em algo grande (ajuste geral de inventário, correção de preços).

### Restaurar

**Backup → Escolher arquivo de backup.** Serve para recuperar em um celular
novo ou voltar atrás depois de um erro.

> **Restaurar substitui tudo.** O conteúdo atual é apagado e trocado pelo do
> arquivo. O app pede confirmação e mostra a data do backup antes. Se algo der
> errado no meio da importação, ele desfaz e deixa como estava.

---

## O que tem nesta versão

**Início** — vendas do dia e do mês, lucro, contas a pagar e receber, estoque
crítico, produção do dia, alertas e atalhos grandes.

**Vendas** — busca o produto, um toque adiciona, `+`/`−` ajusta. O desconto de
atacado entra sozinho, o estoque baixa pelo lote que vence antes e o título
financeiro é criado. Aceita Pix, dinheiro, cartão e transferência — **a venda
a prazo foi removida**, todo recebimento acontece no ato.

- **Comprovante em PDF pelo WhatsApp**, já com o **Pix copia e cola** da venda:
  o cliente cola no banco e o valor vem preenchido. A mensagem que acompanha o
  PDF também traz o código, que no WhatsApp é fácil de copiar.
- **Alterar venda** — estorna a versão anterior (devolve o estoque, cancela os
  títulos) e emite uma nova com o mesmo número e versão `v2`. As duas ficam no
  histórico: é o que permite explicar a diferença numa auditoria.
- **Cadastro de cliente na própria tela de venda**, sem perder o que já foi
  digitado.
- **Rascunho automático** — se o aplicativo fechar no meio da venda, ela volta
  do jeito que estava.
- A tela de vendas **não mostra lucro nem custo**. Esses números ficam em
  Relatórios, onde é você quem olha.

**Produção** — escolhe o produto e a quantidade; o app explode a ficha técnica,
mostra a matéria-prima necessária e avisa o que falta. Ao finalizar, baixa os
insumos, gera o lote `LB-AAAAMMDD-000` com validade, dá entrada no produto
acabado e apura custo e rendimento reais.

**Estoque** — entrada, saída, lotes com validade e histórico de movimentações.

- **Ajuste extraordinário** (Mais › Ajuste extraordinário): perda, devolução,
  inventário e balanço. Cada um exige justificativa e aceita o **documento que
  autoriza** o lançamento — foto ou PDF.
- **Inventário** (Mais › Inventário): abre uma contagem que fotografa o saldo
  do sistema, você anota o que contou item a item, e o fechamento acerta o
  estoque e apura a divergência em quantidade e em dinheiro, com documento
  anexado.

**Fichas técnicas** — ingredientes, perdas, rendimento, mão de obra e energia,
com o custo recalculado na hora conforme o custo médio das compras.

**Clientes** — cadastro, histórico de compras, ticket médio, contas em aberto
e atalho para o WhatsApp.

**Produtos** — agora com **foto** (tirada na hora ou da galeria), **comissão
por produto** e **faixas de desconto por quantidade** próprias ("a partir de
5 kg, 5%"). Mudar o preço de venda pede o **motivo** e aceita o documento que
autoriza; tudo fica no relatório de alterações de preço.

**Catálogo** (Mais › Enviar catálogo) — monta a lista de produtos e preços,
em varejo ou atacado, e manda pelo WhatsApp como PDF ou como mensagem.

**Conferir extrato bancário** (Mais › Conferir extrato bancário) — você baixa
o extrato pelo aplicativo do banco (CSV ou OFX) e escolhe o arquivo aqui.
O aplicativo:

1. casa cada crédito com a venda de mesmo valor, na janela de dias configurada;
2. no extrato de maquininha, aceita o repasse já com a taxa descontada e
   mostra quanto foi de taxa;
3. para o que sobrar — outras receitas e despesas — sugere a classificação
   pelo histórico ("ENEL" vira Energia) e deixa **pré-lançado para você
   conferir e aprovar**;
4. não deixa importar o mesmo extrato duas vezes.

Nada é enviado pela internet: o arquivo é lido dentro do aparelho.

**Relatórios** (Mais › Relatórios) — onze relatórios com filtro de período,
todos exportáveis em PDF pelo WhatsApp:

| Relatório | Para que serve |
|---|---|
| Vendas do período | Toda venda emitida, com as canceladas e as alteradas |
| Resultado do período | Faturamento, custo da mercadoria, despesas e lucro |
| Comissões por produto | Quanto cada produto gerou de comissão |
| Margem por produto | O que vendeu, custou e deixou |
| Movimentações de estoque | Entradas e saídas com o saldo após cada uma |
| Ajustes extraordinários | Perdas e acertos, e **quais têm documento** |
| Alterações de preço | De quanto para quanto, por quê e com qual autorização |
| Inventários | Contagens e a divergência apurada |
| Conciliação bancária | O que já foi conferido e as vendas sem crédito |
| Posição de estoque | Saldo e valor de cada item agora |
| Trilha de auditoria | Tudo o que foi feito no aplicativo, em ordem |

**Financeiro** — lançamento de despesa, receita e **transferência entre contas
próprias**, todos com **documento anexado** (nota fiscal, recibo, comprovante).

**Financeiro** — contas a pagar e a receber com baixa parcial e resumo do mês.

**Formação de preço** — custo, impostos, despesas fixas, comissão, cartão e
margem; mostra preço mínimo e recomendado, e aplica o preço no produto.

**Central de Decisões 🍌** — o que produzir, o que comprar, quais insumos
subiram de preço, quais produtos crescem ou caem, margem por produto, preço
abaixo do mínimo, clientes que sumiram, estoque parado e queda de rendimento.

### O que ficou para depois

Compras com pedido ao fornecedor e pedidos em quadro kanban. Usuários com
perfis de acesso não entram: como é um celular só, perfis e permissões perdem
o sentido.

Duas limitações que vale conhecer:

- **Contas não têm saldo próprio.** Caixa, conta bancária e maquininha existem
  para classificar lançamentos, transferências e extratos — mas o aplicativo
  não mantém um saldo por conta.
- **Venda no cartão entra como recebida na hora.** O repasse real chega dias
  depois; é a conferência do extrato que mostra quando o dinheiro entrou e
  quanto ficou de taxa.

---

## Perguntas que costumam aparecer

**Preciso de internet?** Não. O aplicativo funciona no modo avião. Internet só
é necessária para enviar o backup ao Google Drive, mandar o comprovante pelo
WhatsApp e baixar o extrato do banco.

**O Pix do comprovante cobra de verdade?** Sim. O código é gerado no padrão do
Banco Central, com a sua chave e o valor da venda. Antes da primeira venda,
use o botão de teste em Configurações: ele monta um Pix de R$ 1,00 para você
colar no banco e conferir se o nome aparece certo. **Não pague o teste.**

**Preciso anexar documento em todo ajuste?** Não é obrigatório, mas o relatório
de ajustes extraordinários mostra em vermelho quais lançamentos ficaram sem
documento — é exatamente isso que uma auditoria procura.

**Dá para usar em dois celulares?** Nesta versão, não da forma que você
esperaria: cada celular teria seus próprios dados, sem conversa entre eles.
Para vários celulares com a mesma informação, use a versão de rede.

**Trocar de celular perde os dados?** Não, se você tiver o backup. Instale o
app no aparelho novo e restaure o arquivo.

**Desinstalar o app apaga tudo?** Sim, apaga os dados locais. A cópia
automática do Android costuma trazer de volta na reinstalação, mas não confie
só nela: faça o backup manual antes de desinstalar.

**Cabe quanta informação?** Milhares de registros sem problema. Para uma
fábrica pequena, isso é muito mais que alguns anos de operação.

**Como atualizo o aplicativo?** Gere um APK novo e instale por cima. Se o APK
for de teste (sem chave de assinatura própria), é preciso desinstalar antes —
**faça o backup primeiro**. Configurando a chave de assinatura, descrita em
[`INSTALACAO.md`](INSTALACAO.md), a atualização passa a instalar por cima sem
perder nada.
