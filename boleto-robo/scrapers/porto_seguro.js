// Módulo PORTO SEGURO — segue ao pé da letra o procedimento escrito na
// coluna "Boleto" da planilha original:
//
//   "Acesse o site https://corretor.portoseguro.com.br/portal/site/
//   corretoronline/template.LOGIN/ insira [CPF] no campo 'CPF' e [senha] no
//   campo senha, em seguida clique em 'Entrar'. Selecione a SUSEP
//   'MCZ28J(P)' e clique em 'Entrar'. Vá em 'Cobranças', pesquise pelo CNPJ
//   ou contrato do cliente e clique 'Ver detalhes' e '2°via de boleto' para
//   baixar o boleto desejado."
//
// ATUALIZADO após o primeiro teste real (screenshot do GitHub Actions): a
// URL de login foi parar numa página institucional/propaganda da Porto, não
// direto no formulário de CPF/Senha — precisa clicar em "ACESSAR O CORRETOR
// ONLINE" primeiro. Também troquei getByLabel por seletor de tipo de campo
// (mesmo motivo do sulamerica.js — "CPF"/"Senha" no site real não são
// <label> associados de verdade). Se mesmo assim continuar sem achar os
// campos, pode ser bloqueio anti-robô da Porto (proteção comum em portal de
// corretor) — nesse caso não é um ajuste de seletor que resolve.
// ----------------------------------------------------------------------------

const LOGIN_URL = 'https://corretor.portoseguro.com.br/portal/site/corretoronline/template.LOGIN/';
const SUSEP = 'MCZ28J(P)';

async function login(page, { login: cpf, senha }) {
  if (!cpf || !senha) throw new Error('PORTO_SEGURO_LOGIN / PORTO_SEGURO_SENHA não configurados no ambiente.');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  // Fecha o banner de cookies, se aparecer.
  const btnCookie = page.getByRole('button', { name: /accept all cookies|aceitar/i });
  if (await btnCookie.count()) await btnCookie.first().click().catch(() => {});

  // Se caiu na página institucional (sem campo de senha visível), clica pra
  // entrar no portal de verdade antes de procurar os campos de login.
  const campoSenha = page.locator('input[type="password"]').first();
  if (!(await campoSenha.count())) {
    const btnAcessar = page.getByRole('link', { name: /acessar o corretor online/i })
      .or(page.getByRole('button', { name: /acessar o corretor online/i }));
    if (await btnAcessar.count()) {
      await btnAcessar.first().click();
      await page.waitForLoadState('networkidle');
    }
  }

  await campoSenha.waitFor({ state: 'visible', timeout: 15000 });
  const campoCpf = page
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')
    .first();

  await campoCpf.fill(cpf);
  await campoSenha.fill(senha);
  await page.getByRole('button', { name: /entrar/i }).first().click();
  await page.waitForLoadState('networkidle');

  // Tela de seleção de SUSEP (algumas contas de corretor têm mais de uma).
  const seletorSusep = page.getByText(SUSEP, { exact: false });
  if (await seletorSusep.count()) {
    await seletorSusep.first().click();
    await page.getByRole('button', { name: /entrar/i }).first().click();
    await page.waitForLoadState('networkidle');
  }
}

async function baixarBoleto(page, { nomeEmpresa, cnpj }) {
  await page.getByText(/cobran.?as/i).first().click();
  await page.waitForLoadState('networkidle');

  const termoBusca = cnpj || nomeEmpresa;
  const campoBusca = page.getByRole('textbox').first();
  await campoBusca.fill(termoBusca);
  await campoBusca.press('Enter');
  await page.waitForLoadState('networkidle');

  await page.getByText(/ver detalhes/i).first().click();
  await page.waitForLoadState('networkidle');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
    page.getByText(/2.?via de boleto/i).first().click(),
  ]);
  if (!download) return null;

  const streamPath = await download.path();
  if (!streamPath) return null;
  return require('fs').promises.readFile(streamPath);
}

module.exports = { operadora: 'PORTO SEGURO', login, baixarBoleto };
