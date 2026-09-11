/**
 * Testes de ponta a ponta do aplicativo OFFLINE, em viewport de celular.
 *
 * Cada teste começa com o banco limpo (IndexedDB apagado), então a suíte pode
 * rodar quantas vezes for preciso.
 *
 *   npm run build && npm run preview
 *   BASE_URL=http://localhost:4173 npx playwright test
 */
import { test, expect, type Page } from "@playwright/test";

/** Zera o banco local antes de cada teste. */
async function abrirLimpo(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
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

/** Dá entrada de estoque em um item pelo nome. */
async function entrada(page: Page, produto: string, quantidade: string, custo: string) {
  // Passa por outra rota antes: ir para a mesma URL com hash não recarrega.
  await page.goto("/#/estoque");
  await page.goto("/#/estoque/entrada");
  await page.getByPlaceholder("Digite o nome ou código").fill(produto);
  await page.getByRole("button", { name: new RegExp(produto, "i") }).first().click();
  await page.getByLabel(/^Quantidade/).fill(quantidade);
  await page.getByLabel("Custo unitário").fill(custo);
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await expect(page.getByText(/Entrada registrada/)).toBeVisible();
}

test.describe("Loja da Banana — aplicativo offline", () => {
  test("abre já com o catálogo da empresa, sem pedir servidor", async ({ page }) => {
    await abrirLimpo(page);
    await expect(page.getByText("Vendas hoje")).toBeVisible();
    await expect(page.getByText("Neste aparelho")).toBeVisible();

    await page.goto("/#/produtos");
    await expect(page.getByText("Banana Chips")).toBeVisible();
    await expect(page.getByText("Óleo de coco")).toBeVisible();
    // Nada de preço inventado: o catálogo nasce zerado.
    await expect(page.getByText("custo R$ 0,00").first()).toBeVisible();
  });

  test("entrada de estoque calcula o custo médio ponderado", async ({ page }) => {
    await abrirLimpo(page);
    // 100 kg a R$ 4 + 100 kg a R$ 5 = R$ 4,50 de custo médio
    await entrada(page, "Banana verde", "100", "4,00");
    await entrada(page, "Banana verde", "100", "5,00");

    await page.goto("/#/produtos");
    await page.getByRole("searchbox").fill("Banana verde");
    await page.getByRole("link", { name: /Banana verde/ }).first().click();

    await expect(page.getByText("Custo médio", { exact: true })).toBeVisible();
    await expect(page.getByText("R$ 4,50")).toBeVisible();
    await expect(page.getByText("200", { exact: false }).first()).toBeVisible();
  });

  test("produção gera lote, baixa insumo e apura rendimento", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Banana verde", "200", "5,00");

    // Ficha técnica: 100 kg de banana rendem 25 kg de banana passa
    await page.goto("/#/fichas-tecnicas/nova");
    await page.getByLabel("Produto fabricado").selectOption({ label: "Banana Passa" });
    await page.getByLabel("Rendimento esperado").fill("25");
    await page.getByPlaceholder("Buscar matéria-prima ou embalagem").fill("Banana verde");
    await page.getByRole("button", { name: /Banana verde/ }).first().click();
    await page.getByLabel("Quantidade do ingrediente").fill("100");
    await page.getByRole("button", { name: "Criar ficha técnica" }).click();
    await expect(page.getByText("Ficha técnica criada.")).toBeVisible();

    // Produção
    await page.goto("/#/producao/nova");
    await page.getByLabel("Produto", { exact: true }).selectOption({ label: "Banana Passa" });
    await page.getByLabel(/Quantidade planejada/).fill("25");
    await expect(page.getByText("Matéria-prima necessária")).toBeVisible();
    await expect(page.getByText("Custo estimado")).toBeVisible();
    await page.getByRole("button", { name: "Iniciar produção" }).click();

    await expect(page.getByRole("button", { name: "Finalizar produção" })).toBeVisible();
    await page.getByLabel(/Perdas/).fill("1");
    await page.getByRole("button", { name: "Finalizar produção" }).click();

    await expect(page.getByText(/Lote LB-\d{8}-\d{3} gerado/)).toBeVisible();
    // 25 kg a partir de 100 kg de banana = 25% de rendimento
    await expect(page.getByText("25%", { exact: false }).first()).toBeVisible();

    // A banana foi baixada: 200 − 100 = 100
    await page.goto("/#/estoque");
    await page.getByRole("searchbox").fill("Banana verde");
    await expect(page.getByText("100", { exact: false }).first()).toBeVisible();
  });

  test("venda aplica desconto de atacado e gera o título", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Banana Chips", "50", "26,00");

    // Define os preços
    await page.goto("/#/produtos");
    await page.getByRole("searchbox").fill("Banana Chips");
    await page.getByRole("link", { name: /Banana Chips/ }).first().click();
    await page.getByLabel("Preço de venda", { exact: true }).fill("56,00");
    await page.getByLabel("Preço de atacado", { exact: true }).fill("46,00");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Produto salvo.")).toBeVisible();

    // Venda no atacado: 10 kg → 10% de desconto pela regra padrão
    await page.goto("/#/vendas/nova");
    await page.getByRole("button", { name: "Atacado" }).click();
    await page.getByLabel("Adicionar produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByLabel("Quantidade").fill("10");

    await expect(page.getByText("−10%", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /Finalizar venda.*R\$ 414,00/ })).toBeVisible();

    await page.getByRole("button", { name: /Finalizar venda/ }).click();
    await expect(page.getByText(/registrada com sucesso/)).toBeVisible();
    await expect(page.getByText("Lucro bruto")).toBeVisible();
  });

  test("bloqueia venda sem estoque", async ({ page }) => {
    await abrirLimpo(page);
    await page.goto("/#/produtos");
    await page.getByRole("searchbox").fill("Banana Chips");
    await page.getByRole("link", { name: /Banana Chips/ }).first().click();
    await page.getByLabel("Preço de venda", { exact: true }).fill("50,00");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Produto salvo.")).toBeVisible();

    await page.goto("/#/vendas/nova");
    await page.getByLabel("Adicionar produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByRole("button", { name: /Finalizar venda/ }).click();
    await expect(page.getByText(/Estoque insuficiente/)).toBeVisible();
  });

  test("backup exporta e restaura os dados", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Banana verde", "123", "7,00");

    await page.goto("/#/backup");
    await expect(page.getByText("Registros guardados")).toBeVisible();

    // Gera o arquivo e captura o conteúdo pelo download do navegador
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Baixar arquivo/ }).click();
    const download = await downloadPromise;
    const caminho = await download.path();
    expect(caminho).toBeTruthy();

    await expect(page.getByText(/Backup baixado como/)).toBeVisible();
    await expect(page.getByText(/há 0 dia\(s\)/)).toBeVisible();

    // Altera o estoque depois do backup
    await entrada(page, "Banana verde", "7", "7,00");
    await page.goto("/#/estoque");
    await page.getByRole("searchbox").fill("Banana verde");
    await expect(page.getByText("130", { exact: false }).first()).toBeVisible();

    // Restaura o arquivo baixado: o saldo volta para 123
    await page.goto("/#/backup");
    const fileChooserPromise = page.waitForEvent("filechooser");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: /Escolher arquivo de backup/ }).click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles(caminho!);

    await expect(page.getByText(/Backup restaurado/)).toBeVisible();
    await page.goto("/#/estoque");
    await page.getByRole("searchbox").fill("Banana verde");
    await expect(page.getByText("123", { exact: false }).first()).toBeVisible();
  });

  test("Central de Decisões recomenda a partir dos dados reais", async ({ page }) => {
    await abrirLimpo(page);

    // Define um mínimo e deixa o saldo abaixo dele
    await page.goto("/#/produtos");
    await page.getByRole("searchbox").fill("Banana verde");
    await page.getByRole("link", { name: /Banana verde/ }).first().click();
    await page.getByLabel("Estoque mínimo", { exact: true }).fill("300");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Produto salvo.")).toBeVisible();

    await entrada(page, "Banana verde", "50", "5,00");

    await page.goto("/#/central-decisoes");
    await expect(page.getByRole("heading", { name: /Central de Decisões/ })).toBeVisible();
    await expect(page.getByText(/Recomenda-se comprar/)).toBeVisible();
    await expect(page.getByText(/Banana verde/).first()).toBeVisible();
  });

  test("dados sobrevivem ao fechar e reabrir o aplicativo", async ({ page }) => {
    await abrirLimpo(page);
    await entrada(page, "Açúcar", "42", "6,00");

    // Simula fechar e abrir de novo
    await page.reload();
    await page.goto("/#/estoque");
    await page.getByRole("searchbox").fill("Açúcar");
    await expect(page.getByText("42", { exact: false }).first()).toBeVisible();
  });
});
