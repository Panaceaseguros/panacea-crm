// Módulo SULAMERICA — segue ao pé da letra o procedimento escrito na coluna
// "Boleto" da planilha original:
//
//   "Acesse o site https://corretor.sulamericaseguros.com.br/ insira [login]
//   no campo login e [senha] na senha e clique em 'ok'. Insira o CNPJ do
//   cliente na barra de pesquisa e de 'Enter'. Após isso selecione o
//   contrato e role a tela até localizar 'Pagamentos'. basta clicar em
//   'gerar boleto' no boleto desejado."
//
// ATENÇÃO — mesmo aviso dos outros módulos: escrito só a partir do texto da
// planilha, sem eu ter aberto o portal real (sem rede liberada pra
// corretor.sulamericaseguros.com.br nesta tarefa). Rode com
// DEBUG_HEADFUL=1 (localmente) ou olhe os prints de erro salvos pelo
// runner (erro_sulamerica_*.png, baixados como artifact no GitHub Actions)
// pra ajustar os seletores que não baterem, ANTES de deixar isso agendado
// sem supervisão.
// ----------------------------------------------------------------------------

const LOGIN_URL = 'https://corretor.sulamericaseguros.com.br/';

async function login(page, { login: usuario, senha }) {
  if (!usuario || !senha) throw new Error('SULAMERICA_LOGIN / SULAMERICA_SENHA não configurados no ambiente.');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  await page.getByLabel(/login/i).fill(usuario);
  await page.getByLabel(/senha/i).fill(senha);
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
