/**
 * Testes das funções acrescentadas nesta versão: comprovante com Pix,
 * alteração de venda, descontos por produto, comissão, ajustes com documento,
 * inventário, conciliação bancária, catálogo e rascunho de venda.
 *
 *   npm run build && npm run preview
 *   BASE_URL=http://localhost:4173 npx playwright test
 */
import { test, expect, type Page } from "@playwright/test";

async function abrirLimpo(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("loja-da-banana");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
}

async function entrada(page: Page, produto: string, quantidade: string, custo: string) {
  await page.goto("/#/estoque");
  await page.goto("/#/estoque/entrada");
  await page.getByPlaceholder("Digite o nome ou código").fill(produto);
  await page.getByRole("button", { name: new RegExp(produto, "i") }).first().click();
  await page.getByLabel(/^Quantidade/).fill(quantidade);
  await page.getByLabel("Custo unitário").fill(custo);
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await expect(page.getByText(/Entrada registrada/)).toBeVisible();
}

/** Abre o produto pelo nome na lista de produtos. */
async function abrirProduto(page: Page, nome: string) {
  await page.goto("/#/estoque");
  await page.goto("/#/produtos");
  await page.getByRole("searchbox").fill(nome);
  await page.getByRole("link", { name: new RegExp(nome) }).first().click();
}

async function definirPrecos(page: Page, nome: string, varejo: string, atacado = "") {
  await abrirProduto(page, nome);
  await page.getByLabel("Preço de venda", { exact: true }).fill(varejo);
  if (atacado) await page.getByLabel("Preço de atacado", { exact: true }).fill(atacado);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Produto salvo.")).toBeVisible();
}

const hojeISO = () => new Date().toISOString().slice(0, 10);
const hojeBR = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

test.describe("Comprovante, Pix e catálogo", () => {
  test("comprovante traz o Pix copia e cola válido e não mostra lucro", async ({ page }) => {
    await abrirLimpo(page);

    await page.goto("/#/configuracoes");
    await page.getByLabel("Nome da loja").fill("Loja da Banana");
    await page.getByLabel("WhatsApp da loja").fill("11999990000");
    await page.getByLabel("Incluir os dados do Pix no comprovante de venda").check();
    await page.getByLabel("Chave Pix").fill("12345678901");
    await page.getByLabel("Nome do beneficiário").fill("Loja da Banana ME");
    await page.getByLabel("Cidade do beneficiário").fill("São Paulo");

    // A prévia confere a montagem antes mesmo de salvar.
    await expect(page.getByText(/^00020101/)).toBeVisible();
    await page.getByRole("button", { name: "Salvar parâmetros" }).click();
    await expect(page.getByText("Parâmetros salvos.")).toBeVisible();

    await entrada(page, "Banana Chips", "20", "26,00");
    await definirPrecos(page, "Banana Chips", "50,00");

    await page.goto("/#/vendas/nova");
    await page.getByLabel("Adicionar produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByLabel("Quantidade").fill("2");
    await page.getByRole("button", { name: /Finalizar venda/ }).click();
    await expect(page.getByText(/registrada com sucesso/)).toBeVisible();

    await expect(page.getByText("Pix copia e cola", { exact: true })).toBeVisible();
    const payload = await page.locator("p.font-mono").first().innerText();

    // Confere o padrão do BCB: começa no indicador de formato, traz o valor
    // da venda (R$ 100,00) e fecha com o CRC de 4 dígitos depois de "6304".
    expect(payload.startsWith("000201")).toBe(true);
    expect(payload).toContain("br.gov.bcb.pix");
    expect(payload).toContain("5406100.00");
    expect(payload).toMatch(/6304[0-9A-F]{4}$/);

    await expect(page.getByText("Lucro bruto")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Enviar comprovante em PDF/ })).toBeVisible();
  });

  test("catálogo monta a mensagem com preços e faixas de atacado", async ({ page }) => {
    await abrirLimpo(page);
    await definirPrecos(page, "Banana Chips", "50,00", "44,00");

    await page.goto("/#/catalogo");
    await expect(page.getByText(/produto\(s\) no catálogo/)).toBeVisible();
    await expect(page.getByText("Prévia da mensagem")).toBeVisible();
    await expect(page.getByText(/Banana Chips — R\$\s50,00/)).toBeVisible();

    await page.getByRole("button", { name: /Atacado/ }).click();
    await expect(page.getByText(/Banana Chips — R\$\s44,00/)).toBeVisible();
  });
});

test.describe("Vendas", () => {
  test("desconto por quantidade cadastrado no produto é aplicado", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Banana Chips", "50", "20,00");

    await abrirProduto(page, "Banana Chips");
    await page.getByLabel("Preço de venda", { exact: true }).fill("100,00");
    await page.getByRole("button", { name: "+ Adicionar faixa" }).click();
    await page.getByLabel(/A partir de/).fill("5");
    await page.getByLabel("Desconto %").fill("12");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Produto salvo.")).toBeVisible();

    await page.goto("/#/vendas/nova");
    await page.getByLabel("Adicionar produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();

    // 4 unidades: abaixo da faixa, sem desconto.
    await page.getByLabel("Quantidade").fill("4");
    await expect(page.getByRole("button", { name: /Finalizar venda.*R\$ 400,00/ })).toBeVisible();

    // 5 unidades: entra a faixa de 12% → 500 − 60 = 440
    await page.getByLabel("Quantidade").fill("5");
    await expect(page.getByText("−12%", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /Finalizar venda.*R\$ 440,00/ })).toBeVisible();
  });

  test("não oferece mais venda a prazo", async ({ page }) => {
    await abrirLimpo(page);
    await page.goto("/#/vendas/nova");
    await expect(page.getByRole("button", { name: "Pix", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "A prazo" })).toHaveCount(0);
    await expect(page.getByText("Boleto")).toHaveCount(0);
  });

  test("cadastra cliente sem sair da tela de venda", async ({ page }) => {
    await abrirLimpo(page);
    await page.goto("/#/vendas/nova");

    await page.getByRole("button", { name: "+ Cadastrar cliente novo" }).click();
    await expect(page.getByRole("dialog", { name: "Cliente novo" })).toBeVisible();
    await page.getByLabel("Nome", { exact: true }).fill("Mercado do Zé");
    await page.getByLabel("WhatsApp").fill("11988887777");
    await page.getByRole("button", { name: "Cadastrar e usar na venda" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("Cliente")).toHaveValue(/.+/);
    await expect(page.getByLabel("Cliente")).toContainText("Mercado do Zé");
  });

  test("rascunho da venda sobrevive a fechar o aplicativo", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Banana Chips", "30", "20,00");
    await definirPrecos(page, "Banana Chips", "40,00");

    await page.goto("/#/vendas/nova");
    await page.getByLabel("Adicionar produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByLabel("Quantidade").fill("3");
    await expect(page.getByRole("button", { name: /Finalizar venda.*R\$ 120,00/ })).toBeVisible();

    // Fecha o app no meio da venda e abre de novo.
    await page.reload();
    await page.goto("/#/vendas/nova");
    await expect(page.getByText(/Recuperamos a venda que você tinha começado/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Finalizar venda.*R\$ 120,00/ })).toBeVisible();

    await page.getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByRole("button", { name: /Finalizar venda/ })).toBeDisabled();
  });

  test("alterar venda estorna a anterior e emite nova versão", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Banana Chips", "100", "20,00");
    await definirPrecos(page, "Banana Chips", "50,00");

    await page.goto("/#/vendas/nova");
    await page.getByLabel("Adicionar produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByLabel("Quantidade").fill("4");
    await page.getByRole("button", { name: /Finalizar venda/ }).click();
    await expect(page.getByText(/registrada com sucesso/)).toBeVisible();

    // 100 − 4 = 96 em estoque
    await page.goto("/#/estoque");
    await page.getByRole("searchbox").fill("Banana Chips");
    await expect(page.getByText("96", { exact: false }).first()).toBeVisible();

    await page.goto("/#/vendas");
    await page.getByRole("link", { name: /Consumidor no balcão/ }).first().click();
    await page.getByRole("button", { name: /Alterar venda/ }).click();

    await page.getByLabel("Motivo da alteração").fill("cliente levou 2 a menos");
    await page.getByLabel("Quantidade").fill("2");
    await page.getByRole("button", { name: /Salvar alteração/ }).click();

    await expect(page.getByText(/registrada com sucesso/)).toBeVisible();
    await expect(page.getByText("(v2)")).toBeVisible();
    await expect(page.getByText(/R\$\s100,00/).first()).toBeVisible();

    // O estorno devolveu 4 e a nova versão baixou 2: sobra 98.
    await page.goto("/#/estoque");
    await page.getByRole("searchbox").fill("Banana Chips");
    await expect(page.getByText("98", { exact: false }).first()).toBeVisible();

    // A versão antiga continua no histórico, marcada como substituída.
    await page.goto("/#/relatorios/vendas");
    await expect(page.getByText("Substituída").first()).toBeVisible();
    await expect(page.getByText("Válida").first()).toBeVisible();
  });
});

test.describe("Estoque e auditoria", () => {
  test("perda exige justificativa e guarda o documento", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Banana Chips", "40", "25,00");

    await page.goto("/#/estoque/ajustes");
    await page.getByRole("button", { name: /Perda/ }).click();
    await page.getByLabel("Produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByLabel(/Quantidade de perda/).fill("6");

    // Sem justificativa, não passa.
    await page.getByRole("button", { name: /Registrar perda/ }).click();
    await expect(page.getByText(/exigem uma justificativa/)).toBeVisible();

    await page.getByLabel("Justificativa").fill("lote vencido descartado");

    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Anexar foto ou PDF/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "autorizacao.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 autorizacao de descarte"),
    });
    await expect(page.getByText("autorizacao.pdf")).toBeVisible();

    await page.getByRole("button", { name: /Registrar perda/ }).click();
    await expect(page.getByText(/Documento anexado/)).toBeVisible();

    // 40 − 6 = 34
    await page.goto("/#/estoque");
    await page.getByRole("searchbox").fill("Banana Chips");
    await expect(page.getByText("34", { exact: false }).first()).toBeVisible();

    // O relatório marca que o lançamento tem documento.
    await page.goto("/#/relatorios/ajustes");
    await expect(page.getByText("Perda").first()).toBeVisible();
    await expect(page.getByText("lote vencido descartado")).toBeVisible();
    await expect(page.getByText("Com documento")).toBeVisible();
    await expect(page.getByText("1 de 1")).toBeVisible();
  });

  test("alteração de preço fica registrada com motivo", async ({ page }) => {
    await abrirLimpo(page);
    await definirPrecos(page, "Banana Chips", "50,00");

    await abrirProduto(page, "Banana Chips");
    await page.getByLabel("Preço de venda", { exact: true }).fill("58,00");
    await expect(page.getByText(/Você está alterando o preço/)).toBeVisible();
    await page.getByLabel("Motivo da alteração").fill("banana subiu 15%");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Produto salvo.")).toBeVisible();

    await page.goto("/#/relatorios/precos");
    await expect(page.getByText("banana subiu 15%")).toBeVisible();
    await expect(page.getByText(/R\$\s50,00/).first()).toBeVisible();
    await expect(page.getByText(/R\$\s58,00/).first()).toBeVisible();
  });

  test("inventário apura divergência e acerta o estoque", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Banana Chips", "100", "10,00");

    await page.goto("/#/inventario");
    await page.getByLabel("O que vai ser contado").selectOption("FINISHED");
    await page.getByRole("button", { name: "Abrir contagem" }).click();

    await expect(page.getByText(/Inventário INV-/)).toBeVisible();
    await page.getByLabel(/Contagem de Banana Chips/).fill("94");
    await page.getByLabel(/Contagem de Banana Passa/).click();

    // Faltaram 6 unidades a R$ 10 = R$ 60 de diferença.
    await expect(page.getByText(/-R\$\s60,00/).first()).toBeVisible();

    await page.getByLabel(/Motivo \/ responsável/).fill("contagem mensal");
    await page.getByRole("button", { name: /Fechar e acertar o estoque/ }).click();
    await expect(page.getByText(/Inventário fechado/)).toBeVisible();

    await page.goto("/#/estoque");
    await page.getByRole("searchbox").fill("Banana Chips");
    await expect(page.getByText("94", { exact: false }).first()).toBeVisible();

    await page.goto("/#/relatorios/inventarios");
    await expect(page.getByText("Fechado").first()).toBeVisible();
  });
});

test.describe("Comissões e relatórios", () => {
  test("comissão por produto entra no relatório", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Banana Chips", "50", "20,00");

    await abrirProduto(page, "Banana Chips");
    await page.getByLabel("Preço de venda", { exact: true }).fill("100,00");
    await page.getByLabel(/Comissão sobre a venda/).fill("5");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Produto salvo.")).toBeVisible();

    await page.goto("/#/vendas/nova");
    await page.getByLabel("Adicionar produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByLabel("Quantidade").fill("3");
    await page.getByRole("button", { name: /Finalizar venda/ }).click();
    await expect(page.getByText(/registrada com sucesso/)).toBeVisible();

    // 3 × R$ 100 = R$ 300; 5% = R$ 15,00
    await page.goto("/#/relatorios/comissoes");
    await expect(page.getByText("Comissão total")).toBeVisible();
    await expect(page.getByText(/R\$\s15,00/).first()).toBeVisible();
    await expect(page.getByText("5%", { exact: true }).first()).toBeVisible();
  });

  test("filtro de período muda o resultado apurado", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Banana Chips", "50", "20,00");
    await definirPrecos(page, "Banana Chips", "100,00");

    await page.goto("/#/vendas/nova");
    await page.getByLabel("Adicionar produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByLabel("Quantidade").fill("2");
    await page.getByRole("button", { name: /Finalizar venda/ }).click();
    await expect(page.getByText(/registrada com sucesso/)).toBeVisible();

    await page.goto("/#/relatorios/resultado");
    await page.getByRole("button", { name: "Hoje" }).click();
    await expect(page.getByText("Faturamento").first()).toBeVisible();
    await expect(page.getByText(/R\$\s200,00/).first()).toBeVisible();
    // 200 de venda − 40 de custo = 160 de lucro bruto
    await expect(page.getByText(/R\$\s160,00/).first()).toBeVisible();

    // Mês passado não tem nada.
    await page.getByRole("button", { name: "Mês passado" }).click();
    await expect(page.getByText(/R\$\s0,00/).first()).toBeVisible();
  });
});

test.describe("Conciliação bancária", () => {
  test("casa o crédito com a venda e propõe o resto", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Banana Chips", "50", "20,00");
    await definirPrecos(page, "Banana Chips", "100,00");

    // Venda de R$ 300 no Pix, hoje.
    await page.goto("/#/vendas/nova");
    await page.getByLabel("Adicionar produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByLabel("Quantidade").fill("3");
    await page.getByRole("button", { name: /Finalizar venda/ }).click();
    await expect(page.getByText(/registrada com sucesso/)).toBeVisible();

    const csv = [
      "Data;Historico;Valor",
      `${hojeBR()};PIX RECEBIDO CLIENTE;300,00`,
      `${hojeBR()};ENEL ENERGIA SETEMBRO;-245,80`,
      `${hojeBR()};TARIFA PACOTE DE SERVICOS;-39,90`,
    ].join("\n");

    await page.goto("/#/conciliacao");
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Escolher arquivo do extrato/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "extrato.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8"),
    });

    // O crédito de R$ 300 casou sozinho com a venda.
    await page.getByRole("button", { name: /Conferidos/ }).click();
    await expect(page.getByText("PIX RECEBIDO CLIENTE")).toBeVisible();
    await expect(page.getByText(/Casado com VD-/)).toBeVisible();

    // Os débitos viraram propostas classificadas.
    await page.getByRole("button", { name: /A conferir/ }).click();
    await expect(page.getByText("ENEL ENERGIA SETEMBRO")).toBeVisible();
    await expect(page.getByText("Energia").first()).toBeVisible();
    await expect(page.getByText("Despesa").first()).toBeVisible();

    await page.getByRole("button", { name: "Marcar todos" }).click();
    await page.getByRole("button", { name: /Aprovar 2 lançamento/ }).click();
    await expect(page.getByText(/2 lançamento\(s\) aprovados/)).toBeVisible();

    // Viraram contas a pagar JÁ QUITADAS: o dinheiro saiu na data do extrato.
    await page.goto("/#/financeiro/pagar");
    await page.getByRole("button", { name: "Quitadas" }).click();
    await expect(page.getByText("ENEL ENERGIA SETEMBRO")).toBeVisible();
    await expect(page.getByText("TARIFA PACOTE DE SERVICOS")).toBeVisible();
  });

  test("extrato de maquininha casa a venda com a taxa descontada", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Banana Chips", "50", "20,00");
    await definirPrecos(page, "Banana Chips", "100,00");

    await page.goto("/#/vendas/nova");
    await page.getByLabel("Adicionar produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByLabel("Quantidade").fill("2");
    await page.getByRole("button", { name: "Cartão" }).click();
    await page.getByRole("button", { name: /Finalizar venda/ }).click();
    await expect(page.getByText(/registrada com sucesso/)).toBeVisible();

    // Venda de R$ 200; a maquininha repassa R$ 193,00 (3,5% de taxa).
    const csv = [
      "Data,Descricao,Valor",
      `${hojeISO()},REPASSE CIELO,193.00`,
    ].join("\n");

    await page.goto("/#/conciliacao");
    await page.getByRole("button", { name: /Maquininha/ }).click();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Escolher arquivo do extrato/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "cielo.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8"),
    });

    await page.getByRole("button", { name: /Conferidos/ }).click();
    await expect(page.getByText(/Casado com VD-/)).toBeVisible();
    await expect(page.getByText(/taxa de R\$\s7,00/)).toBeVisible();
  });

  test("não importa o mesmo extrato duas vezes", async ({ page }) => {
    await abrirLimpo(page);
    const csv = [
      "Data;Historico;Valor",
      `${hojeBR()};ALUGUEL DO GALPAO;-1500,00`,
    ].join("\n");

    const importar = async () => {
      await page.goto("/#/estoque");
      await page.goto("/#/conciliacao");
      const chooserPromise = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: /Escolher arquivo do extrato/ }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles({
        name: "extrato.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8"),
      });
    };

    await importar();
    await expect(page.getByText("ALUGUEL DO GALPAO")).toBeVisible();

    await importar();
    // Segunda importação: nada novo entra e nenhum extrato vazio é criado.
    await expect(page.getByText(/Nada novo neste arquivo/)).toBeVisible();
    await expect(page.getByText("ALUGUEL DO GALPAO")).toHaveCount(0);
    await expect(page.getByText("extrato.csv")).toHaveCount(1);
  });
});

test.describe("Financeiro", () => {
  test("despesa aceita documento e transferência fica registrada", async ({ page }) => {
    await abrirLimpo(page);

    await page.goto("/#/financeiro/novo");
    await page.getByLabel("Descrição").fill("Compra de embalagens");
    await page.getByLabel("Valor total").fill("480,00");

    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Anexar foto ou PDF/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "nota-fiscal.pdf", mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 nota"),
    });
    await expect(page.getByText("nota-fiscal.pdf")).toBeVisible();

    await page.getByRole("button", { name: "Registrar lançamento" }).click();
    await expect(page.getByText("Compra de embalagens")).toBeVisible();

    // Transferência entre contas próprias
    await page.goto("/#/financeiro/novo");
    await page.getByRole("button", { name: /Transferência/ }).click();
    await expect(page.getByLabel("De", { exact: true })).toBeVisible();
    await page.getByLabel("Descrição").fill("Caixa para o banco");
    await page.getByLabel("Valor total").fill("1000,00");
    // O botão só libera quando as contas padrão já existem.
    await page.getByRole("button", { name: "Registrar transferência" }).click();
    await expect(page.getByRole("heading", { name: "Financeiro" })).toBeVisible();

    await page.goto("/#/estoque");
    await page.goto("/#/mais");
    await expect(page.getByText(/Caixa → Conta bancária: R\$\s1\.000,00/)).toBeVisible();
  });
});

test.describe("PDF gerado no aparelho", () => {
  test("comprovante sai em PDF legível, com itens, total e Pix", async ({ page }) => {
    await abrirLimpo(page);

    await page.goto("/#/configuracoes");
    await page.getByLabel("Nome da loja").fill("Loja da Banana");
    await page.getByLabel("Endereço").fill("Rua das Bananeiras, 100");
    await page.getByLabel("Incluir os dados do Pix no comprovante de venda").check();
    await page.getByLabel("Chave Pix").fill("12345678901");
    await page.getByLabel("Nome do beneficiário").fill("Loja da Banana ME");
    await page.getByLabel("Cidade do beneficiário").fill("São Paulo");
    await page.getByRole("button", { name: "Salvar parâmetros" }).click();
    await expect(page.getByText("Parâmetros salvos.")).toBeVisible();

    await entrada(page, "Banana Chips", "20", "26,00");
    await definirPrecos(page, "Banana Chips", "50,00");

    await page.goto("/#/vendas/nova");
    await page.getByLabel("Adicionar produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByLabel("Quantidade").fill("2");
    await page.getByRole("button", { name: /Finalizar venda/ }).click();
    await expect(page.getByText(/registrada com sucesso/)).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Enviar comprovante em PDF/ }).click();
    const arquivo = await (await download).path();
    expect(arquivo).toBeTruthy();

    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(arquivo!);
    // Arquivo PDF de verdade: assinatura, tabela xref e fim de arquivo.
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.toString("latin1")).toContain("startxref");
    expect(bytes.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);

    // O conteúdo foi escrito com as fontes padrão: dá para achar o texto.
    const texto = bytes.toString("latin1");
    expect(texto).toContain("COMPROVANTE DE VENDA");
    expect(texto).toContain("Banana Chips");
    expect(texto).toContain("PAGUE COM PIX");
    expect(texto).toContain("br.gov.bcb.pix");
    expect(bytes.length).toBeGreaterThan(1500);
  });

  test("relatório sai em PDF com o período no cabeçalho", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Banana Chips", "30", "20,00");

    await page.goto("/#/relatorios/estoque");
    await expect(page.getByText("Valor do estoque")).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Gerar PDF e enviar/ }).click();
    const arquivo = await (await download).path();

    const { readFileSync } = await import("node:fs");
    const texto = readFileSync(arquivo!).toString("latin1");
    expect(texto.startsWith("%PDF-")).toBe(true);
    expect(texto).toContain("POSI");           // "POSIÇÃO DE ESTOQUE" com acento escapado
    expect(texto).toContain("Banana Chips");
    expect(texto).toContain("Emitido em");
  });

  test("catálogo sai em PDF com os preços", async ({ page }) => {
    await abrirLimpo(page);
    await definirPrecos(page, "Banana Chips", "49,90");

    await page.goto("/#/catalogo");
    await expect(page.getByText(/produto\(s\) no catálogo/)).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Enviar catálogo em PDF/ }).click();
    const arquivo = await (await download).path();

    const { readFileSync } = await import("node:fs");
    const texto = readFileSync(arquivo!).toString("latin1");
    expect(texto.startsWith("%PDF-")).toBe(true);
    expect(texto).toContain("Banana Chips");
    expect(texto).toContain("49,90");
  });
});

test.describe("Backup com as novidades", () => {
  test("documento anexado sobrevive ao backup e à restauração", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Banana Chips", "40", "25,00");

    // Perda com documento: é a prova que a auditoria vai cobrar.
    await page.goto("/#/estoque/ajustes");
    await page.getByLabel("Produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByLabel(/Quantidade de perda/).fill("5");
    await page.getByLabel("Justificativa").fill("caixa molhada na chuva");

    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Anexar foto ou PDF/ }).click();
    (await chooserPromise).setFiles({
      name: "laudo.pdf", mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 laudo de avaria"),
    });
    await page.getByRole("button", { name: /Registrar perda/ }).click();
    await expect(page.getByText(/Documento anexado/)).toBeVisible();

    // Gera o backup
    await page.goto("/#/backup");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Baixar arquivo/ }).click();
    const caminho = await (await download).path();

    const { readFileSync } = await import("node:fs");
    const conteudo = JSON.parse(readFileSync(caminho!, "utf-8"));
    expect(conteudo.resumo.attachments).toBe(1);
    expect(conteudo.dados.attachments[0].name).toBe("laudo.pdf");
    expect(conteudo.dados.attachments[0].data.length).toBeGreaterThan(10);

    // Apaga tudo e restaura
    await abrirLimpo(page);
    await page.goto("/#/backup");
    const fileChooserPromise = page.waitForEvent("filechooser");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: /Escolher arquivo de backup/ }).click();
    (await fileChooserPromise).setFiles(caminho!);
    await expect(page.getByText(/Backup restaurado/)).toBeVisible();

    // O lançamento e o documento voltaram.
    await page.goto("/#/relatorios/ajustes");
    await expect(page.getByText("caixa molhada na chuva")).toBeVisible();
    await expect(page.getByText("1 de 1")).toBeVisible();

    await page.goto("/#/estoque");
    await page.getByRole("searchbox").fill("Banana Chips");
    await expect(page.getByText("35", { exact: false }).first()).toBeVisible();
  });
});
