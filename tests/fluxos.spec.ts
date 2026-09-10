/**
 * Testes de ponta a ponta pela interface, em viewport de celular.
 *
 * Exige o app rodando e o banco com o seed base aplicado:
 *   npm run build && npm start   (ou npm run dev)
 *   BASE_URL=http://localhost:3000 npm run test:e2e
 *
 * Os seletores usam o atributo `name` dos campos: é o que não muda quando o
 * texto da tela é ajustado.
 */
import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.ADMIN_EMAIL ?? "admin@lojadabanana.com.br";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "LojaDaBanana@2026";

const field = (page: Page, name: string) => page.locator(`[name="${name}"]`);

async function login(page: Page, email = EMAIL, password = PASSWORD) {
  await page.goto("/login");
  await field(page, "email").fill(email);
  await field(page, "password").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  // No primeiro acesso o sistema leva para a troca de senha; seguimos ao início.
  if (page.url().includes("/perfil")) await page.goto("/");
}

/** Dá entrada de estoque em um item, pelo nome. */
async function entrada(page: Page, produto: string, quantidade: string, custo: string) {
  await page.goto("/estoque/entrada");
  await page.getByPlaceholder("Digite o nome ou código").fill(produto);
  await page.getByRole("button", { name: new RegExp(produto, "i") }).first().click();
  await field(page, "quantity").fill(quantidade);
  await field(page, "unitCost").fill(custo);
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await expect(page.getByText(/Entrada registrada/)).toBeVisible();
}

test.describe("Loja da Banana — ERP", () => {
  test("bloqueia acesso sem login", async ({ page }) => {
    await page.goto("/estoque");
    await expect(page).toHaveURL(/\/login/);
  });

  test("rejeita senha incorreta", async ({ page }) => {
    await page.goto("/login");
    await field(page, "email").fill(EMAIL);
    await field(page, "password").fill("senha-errada-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  });

  test("entra e mostra o dashboard com indicadores e atalhos", async ({ page }) => {
    await login(page);
    await expect(page.getByText("Vendas de hoje")).toBeVisible();
    await expect(page.getByText("Contas a receber")).toBeVisible();
    await expect(page.getByRole("link", { name: /Nova venda/ })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
  });

  test("cadastra produto e a entrada de estoque aparece no saldo", async ({ page }) => {
    await login(page);
    const nome = `Insumo Teste ${Date.now()}`;

    await page.goto("/produtos/novo");
    await field(page, "name").fill(nome);
    await field(page, "kind").selectOption("RAW");
    await field(page, "minStock").fill("10");
    await page.getByRole("button", { name: "Cadastrar produto" }).click();
    await page.waitForURL(/\/produtos\/[a-z0-9]+/);
    await expect(page.getByText("Produto salvo com sucesso.")).toBeVisible();

    await entrada(page, nome, "40", "7,50");

    await page.goto("/estoque");
    await page.getByRole("searchbox").fill(nome);
    await expect(page.getByText(nome)).toBeVisible();
    await expect(page.getByText("40", { exact: false }).first()).toBeVisible();
  });

  test("registra uma venda em poucos toques e apura a margem", async ({ page }) => {
    await login(page);
    await entrada(page, "Banana Chips", "50", "26,00");

    // define o preço de venda
    await page.goto("/produtos");
    await page.getByRole("searchbox").fill("Banana Chips");
    await page.getByRole("link", { name: /Banana Chips/ }).first().click();
    await field(page, "salePrice").fill("52,00");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Produto salvo com sucesso.")).toBeVisible();

    // busca → um toque adiciona → + ajusta → finaliza
    await page.goto("/vendas/nova");
    await page.locator("#item-search").fill("Banana Chips");
    await page.getByRole("button", { name: /Banana Chips/ }).first().click();
    await page.getByRole("button", { name: "Aumentar" }).click();
    await expect(page.locator('[name="items[0][quantity]"]')).toHaveValue("2");
    await page.getByRole("button", { name: "Finalizar venda" }).click();

    await page.waitForURL(/\/vendas\/[a-z0-9]+/);
    await expect(page.getByText(/registrada com sucesso/)).toBeVisible();
    await expect(page.getByText("Lucro bruto")).toBeVisible();
  });

  test("cria ficha técnica e a produção gera lote com rendimento", async ({ page }) => {
    await login(page);
    await entrada(page, "Banana verde", "200", "5,00");

    // Ficha técnica: 100 kg de banana rendem 25 kg de banana passa
    await page.goto("/fichas-tecnicas/nova");
    await field(page, "productId").selectOption({ label: "Banana Passa" });
    await field(page, "yieldQty").fill("25");
    await page.getByPlaceholder("Buscar matéria-prima ou embalagem").fill("Banana verde");
    await page.getByRole("button", { name: /Banana verde/ }).first().click();
    await page.locator('input[inputmode="decimal"]').nth(1).fill("100");
    await page.getByRole("button", { name: "Criar ficha técnica" }).click();
    await page.waitForURL(/\/fichas-tecnicas\/[a-z0-9]+/);
    await expect(page.getByText("Composição do custo")).toBeVisible();

    // Produção
    await page.goto("/producao/nova");
    await field(page, "productId").selectOption({ label: "Banana Passa" });
    await field(page, "plannedQty").fill("25");
    await expect(page.getByText("Matéria-prima necessária")).toBeVisible();
    await expect(page.getByText("Custo estimado")).toBeVisible();
    await page.getByRole("button", { name: "Iniciar produção" }).click();
    await page.waitForURL(/\/producao\/[a-z0-9]+/);

    await field(page, "producedQty").fill("25");
    await field(page, "lossQty").fill("1");
    await page.getByRole("button", { name: "Finalizar produção" }).click();
    await expect(page.getByText(/Lote LB-\d{8}-\d{3} gerado/)).toBeVisible();

    // O rendimento apurado deve ser 25% (25 kg a partir de 100 kg de banana)
    await expect(page.getByText("25.0%")).toBeVisible();
  });

  test("Central de Decisões apresenta recomendações", async ({ page }) => {
    await login(page);
    await page.goto("/central-decisoes");
    await expect(page.getByRole("heading", { name: /Central de Decisões/ })).toBeVisible();
    await expect(page.getByText(/Como as recomendações são calculadas/)).toBeVisible();
  });

  test("relatórios abrem e respeitam o filtro de período", async ({ page }) => {
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
    await field(page, "name").fill("Operador de Teste");
    await field(page, "email").fill(email);
    await field(page, "roleId").selectOption({ label: "Produção" });
    await field(page, "password").fill(senha);
    await page.getByRole("button", { name: "Salvar usuário" }).click();
    await expect(page.getByText(/salvo/)).toBeVisible();

    await context.clearCookies();
    await login(page, email, senha);

    const nav = page.getByRole("navigation", { name: "Navegação principal" });
    await expect(nav.getByText("Produção")).toBeVisible();
    await expect(nav.getByText("Financeiro")).toHaveCount(0);

    // E o acesso direto ao módulo também é barrado
    await page.goto("/financeiro/despesas");
    await expect(page).toHaveURL(/^(?!.*\/financeiro).*$/);
  });
});
