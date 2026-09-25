// Módulo SULAMERICA — segue ao pé da letra o procedimento escrito na coluna
// "Boleto" da planilha original:
//
//   "Acesse o site https://corretor.sulamericaseguros.com.br/ insira [login]
//   no campo login e [senha] na senha e clique em 'ok'. Insira o CNPJ do
//   cliente na barra de pesquisa e de 'Enter'. Após isso selecione o
//   contrato e role a tela até localizar 'Pagamentos'. basta clicar em
//   'gerar boleto' no boleto desejado."
//
// ATUALIZADO após o primeiro teste real (screenshot do GitHub Actions): a
// tela de login carrega normalmente, mas "Login" e "Senha" ali são só um
// texto solto acima da caixa (não um <label> de verdade associado ao
// campo), então getByLabel não encontrava nada e travava em timeout. Troquei
// pra localizar os campos pelo TIPO do input, que é bem mais confiável:
// senha é sempre input[type="password"], e login é o primeiro campo de
// texto da página. Também fecha o banner de cookies, que aparecia por cima
// da tela no print.
// ----------------------------------------------------------------------------

const LOGIN_URL = 'https://corretor.sulamericaseguros.com.br/';

async function login(page, { login: usuario, senha }) {
  if (!usuario || !senha) throw new Error('SULAMERICA_LOGIN / SULAMERICA_SENHA não configurados no ambiente.');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  // Fecha o banner de cookies, se aparecer — senão ele fica por cima da tela.
  const btnCookie = page.getByRole('button', { name: /continuar|aceitar/i });
  if (await btnCookie.count()) await btnCookie.first().click().catch(() => {});

  const campoSenha = page.locator('input[type="password"]').first();
  await campoSenha.waitFor({ state: 'visible', timeout: 15000 });
  const campoLogin = page
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')
    .first();

  await campoLogin.fill(usuario);
  await campoSenha.fill(senha);
  await page.getByRole('button', { name: /^ok$/i }).click();
  await page.waitForLoadState('networkidle');
}

async function baixarBoleto(page, { nomeEmpresa, cnpj }) {
  const termoBusca = cnpj || nomeEmpresa;
  const barraPesquisa = page.getByRole('textbox').first();
  await barraPesquisa.fill(termoBusca);
  await barraPesquisa.press('Enter');
  await page.waitForLoadState('networkidle');

  await page.getByText(termoBusca).first().click();
  await page.waitForLoadState('networkidle');

  await page.getByText(/pagamentos/i).first().scrollIntoViewIfNeeded();
  await page.getByText(/pagamentos/i).first().click().catch(() => {});

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
    page.getByText(/gerar boleto/i).first().click(),
  ]);
  if (!download) return null;

  const streamPath = await download.path();
  if (!streamPath) return null;
  return require('fs').promises.readFile(streamPath);
}

module.exports = { operadora: 'SULAMERICA', login, baixarBoleto };
