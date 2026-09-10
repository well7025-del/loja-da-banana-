/**
 * Testes de ponta a ponta pela interface, em viewport de celular.
 * Exige o app rodando (npm run dev) e o banco com o seed aplicado.
 */
import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.ADMIN_EMAIL ?? "admin@lojadabanana.com.br";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "LojaDaBanana@2026";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  // No primeiro acesso o sistema leva para a troca de senha; seguimos ao início.
  if (page.url().includes("/perfil")) await page.goto("/");
}

test.describe("Loja da Banana — ERP", () => {
  test("bloqueia acesso sem login", async ({ page }) => {
    await page.goto("/estoque");
    await expect(page).toHaveURL(/\/login/);
  });

  test("rejeita senha incorreta", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(EMAIL);
    await page.getByLabel("Senha").fill("senha-errada-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  });

  test("entra e mostra o dashboard com os indicadores", async ({ page }) => {
    await login(page);
    await expect(page.getByText("Vendas de hoje")).toBeVisible();
    await expect(page.getByText("Contas a receber")).toBeVisible();
    await expect(page.getByRole("link", { name: /Nova venda/ })).toBeVisible();
    // menu inferior visível no celular
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
  });

  test("cadastra produto, dá entrada no estoque e o saldo aparece", async ({ page }) => {
    await login(page);
    const nome = `Teste Automatizado ${Date.now()}`;

    await page.goto("/produtos/novo");
    await page.getByLabel("Nome do produto").fill(nome);
    await page.getByLabel("Tipo", { exact: true }).selectOption("RAW");
    await page.getByLabel("Estoque mínimo").fill("10");
    await page.getByRole("button", { name: "Cadastrar produto" }).click();
    await page.waitForURL(/\/produtos\/[a-z0-9]+/);
    await expect(page.getByText("Produto salvo com sucesso.")).toBeVisible();

    await page.goto("/estoque/entrada");
    await page.getByLabel("Produto").fill(nome.slice(0, 20));
    await page.getByRole("button", { name: new RegExp(nome.slice(0, 15)) }).click();
    await page.getByLabel("Quantidade").fill("40");
    await page.getByLabel("Custo unitário").fill("7,50");
    await page.getByRole("button", { name: "Registrar entrada" }).click();
    await expect(page.getByText(/Entrada registrada/)).toBeVisible();

    await page.goto("/estoque");
    await page.getByRole("searchbox").fill(nome.slice(0, 20));
    await expect(page.getByText(nome)).toBeVisible();
  });

  test("registra uma venda em poucos toques e baixa o estoque", async ({ page }) => {
    await login(page);

    // Garante estoque do produto de teste
    await page.goto("/estoque/entrada");
    await page.getByLabel("Produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByLabel("Quantidade").fill("50");
    await page.getByLabel("Custo unitário").fill("26,00");
    await page.getByRole("button", { name: "Registrar entrada" }).click();
    await expect(page.getByText(/Entrada registrada/)).toBeVisible();

    // Define preço de venda
    await page.goto("/produtos");
    await page.getByRole("searchbox").fill("Banana Chips");
    await page.getByRole("link", { name: /Banana Chips/ }).first().click();
    await page.getByLabel("Preço de venda (varejo)").fill("52,00");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Produto salvo com sucesso.")).toBeVisible();

    // Venda: buscar → tocar no produto → finalizar
    await page.goto("/vendas/nova");
    await page.getByLabel("Adicionar produto").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByRole("button", { name: "Aumentar" }).click(); // 2 unidades
    await expect(page.getByRole("button", { name: "Finalizar venda" })).toBeEnabled();
    await page.getByRole("button", { name: "Finalizar venda" }).click();

    await page.waitForURL(/\/vendas\/[a-z0-9]+/);
    await expect(page.getByText(/registrada com sucesso/)).toBeVisible();
    await expect(page.getByText("Lucro bruto")).toBeVisible();
  });

  test("cria ficha técnica e registra produção gerando lote", async ({ page }) => {
    await login(page);

    // Insumos com saldo
    for (const [item, qtd, custo] of [["Banana verde", "200", "5,00"], ["Óleo de coco", "20", "30,00"]] as const) {
      await page.goto("/estoque/entrada");
      await page.getByLabel("Produto").fill(item);
      await page.getByRole("button", { name: new RegExp(item) }).first().click();
      await page.getByLabel("Quantidade").fill(qtd);
      await page.getByLabel("Custo unitário").fill(custo);
      await page.getByRole("button", { name: "Registrar entrada" }).click();
      await expect(page.getByText(/Entrada registrada/)).toBeVisible();
    }

    // Ficha técnica de Banana Passa
    await page.goto("/fichas-tecnicas/nova");
    await page.getByLabel("Produto fabricado").selectOption({ label: "Banana Passa" });
    await page.getByLabel("Rendimento esperado").fill("25");
    await page.getByLabel("Adicionar item").fill("Banana verde");
    await page.getByRole("button", { name: /Banana verde/ }).first().click();
    await page.getByLabel("Quantidade", { exact: true }).first().fill("100");
    await page.getByRole("button", { name: "Criar ficha técnica" }).click();
    await page.waitForURL(/\/fichas-tecnicas\/[a-z0-9]+/);
    await expect(page.getByText("Composição do custo")).toBeVisible();

    // Produção
    await page.goto("/producao/nova");
    await page.getByLabel("Produto", { exact: true }).selectOption({ label: "Banana Passa" });
    await page.getByLabel(/Quantidade planejada/).fill("25");
    await expect(page.getByText("Matéria-prima necessária")).toBeVisible();
    await page.getByRole("button", { name: "Iniciar produção" }).click();
    await page.waitForURL(/\/producao\/[a-z0-9]+/);

    await page.getByLabel(/Quantidade produzida/).fill("25");
    await page.getByLabel(/^Perdas/).fill("1");
    await page.getByRole("button", { name: "Finalizar produção" }).click();
    await expect(page.getByText(/Lote LB-\d{8}-\d{3} gerado/)).toBeVisible();
  });

  test("Central de Decisões apresenta recomendações", async ({ page }) => {
    await login(page);
    await page.goto("/central-decisoes");
    await expect(page.getByRole("heading", { name: /Central de Decisões/ })).toBeVisible();
    await expect(page.getByText(/Como as recomendações são calculadas/)).toBeVisible();
  });

  test("relatórios abrem com filtro de período", async ({ page }) => {
    await login(page);
    await page.goto("/relatorios/vendas-produto");
    await expect(page.getByRole("heading", { name: "Vendas por produto" })).toBeVisible();
    await page.getByRole("button", { name: "Ano" }).click();
    await expect(page.getByText(/Este ano/)).toBeVisible();
  });

  test("permissões: perfil de produção não enxerga o financeiro", async ({ page, context }) => {
    await login(page);
    const senha = "SenhaTeste@2026";
    const email = `producao.teste.${Date.now()}@lojadabanana.com.br`;

    await page.goto("/usuarios");
    await page.getByRole("button", { name: "+ Novo usuário" }).click();
    await expect(page.getByText("Novo usuário", { exact: true })).toBeVisible();
    await page.getByLabel("Nome", { exact: true }).fill("Operador de Teste");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Perfil de acesso").selectOption({ label: "Produção" });
    await page.getByLabel("Senha inicial").fill(senha);
    await page.getByRole("button", { name: "Salvar usuário" }).click();
    await expect(page.getByText(/salvo/)).toBeVisible();

    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));

    // O menu inferior não deve oferecer Financeiro
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Navegação principal" });
    await expect(nav.getByText("Produção")).toBeVisible();
    await expect(nav.getByText("Financeiro")).toHaveCount(0);
  });
});
