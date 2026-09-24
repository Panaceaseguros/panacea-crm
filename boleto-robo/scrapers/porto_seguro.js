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
// ATENÇÃO — leia isto antes de confiar no script (mesmo aviso do amil.js):
// Escrito só a partir do texto da planilha, sem eu ter aberto o portal real
// — não tenho rede liberada pra corretor.portoseguro.com.br nesta tarefa.
// Rode com DEBUG_HEADFUL=1 (localmente) ou olhe os prints de erro salvos
// pelo runner (erro_porto_seguro_*.png, baixados como artifact no GitHub
// Actions) pra ajustar os seletores que não baterem, ANTES de deixar isso
// agendado sem supervisão.
// ----------------------------------------------------------------------------

const LOGIN_URL = 'https://corretor.portoseguro.com.br/portal/site/corretoronline/template.LOGIN/';
const SUSEP = 'MCZ28J(P)';

async function login(page, { login: cpf, senha }) {
  if (!cpf || !senha) throw new Error('PORTO_SEGURO_LOGIN / PORTO_SEGURO_SENHA não configurados no ambiente.');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  await page.getByLabel(/^cpf$/i).fill(cpf);
  await page.getByLabel(/senha/i).fill(senha);
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
