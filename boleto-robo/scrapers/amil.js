// Módulo AMIL — segue ao pé da letra o procedimento escrito na coluna
// "Boleto" da planilha original:
//
//   "Acesse o site [...] insira o CPF [...] no campo 'Usuário Corretor' e
//   [...] no campo 'Senha' e clique em 'Entrar'. Após logar acesse 'Gestão
//   comercial'. Na proxima tela clique em 'menu', 'portal cliente empresa',
//   'gestão financeira e demonstrativos' e 'consultar faturas emitidas'.
//   Na nova tela clique na lupa (ao lado de contrato) para que seja aberto
//   uma nova aba. Nessa nova aba de um 'Ctrl + F' e pesquise pelo cliente
//   desejado (nome da empresa, CNPJ, ou numero do contrato). Após
//   selecionar o contrato voce sera redirecionado para a tela anterior.
//   Basta selecionar o periodo que deseja consultar e clicar na seta verde
//   (abaixo de menu), e baixar o boleto desejado."
//
// ATENÇÃO — leia isto antes de confiar no script:
// Eu escrevi esta automação só a partir do texto acima, sem conseguir abrir
// o portal real (não tenho rede liberada pra portalcorretor.amil.com.br
// nesta tarefa, nem deveria tentar login de produção sem ninguém
// acompanhando). Ou seja, os nomes de botão/campo abaixo são os MESMOS que
// estão escritos na planilha, mas a estrutura real da página (se é um
// botão, um link, dentro de um iframe, se o texto tem espaço/acento
// diferente etc.) eu não validei. Rode isto pelo menos 1x com
// DEBUG_HEADFUL=1 (abre o Chrome visível) acompanhando a tela, ajuste os
// seletores que não baterem, e só depois agende sem supervisão.
// ----------------------------------------------------------------------------

const LOGIN_URL = 'https://portalcorretor.amil.com.br/portal/web/servicos/usuario/corretor/login';

async function login(page, { login: usuario, senha }) {
  if (!usuario || !senha) throw new Error('AMIL_LOGIN / AMIL_SENHA não configurados no ambiente.');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  // Campos identificados pelo texto do rótulo, como descrito na planilha
  // ("Usuário Corretor" / "Senha") — mais resistente a mudanças de layout
  // do que um seletor CSS fixo, mas ainda depende do rótulo real da página.
  await page.getByLabel(/usu.?rio corretor/i).fill(usuario);
  await page.getByLabel(/senha/i).fill(senha);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForLoadState('networkidle');

  await page.getByText(/gest.?o comercial/i).first().click();
  await page.waitForLoadState('networkidle');
}

async function navegarParaFaturas(page) {
  await page.getByText(/^menu$/i).first().click();
  await page.getByText(/portal cliente empresa/i).first().click();
  await page.getByText(/gest.?o financeira e demonstrativos/i).first().click();
  await page.getByText(/consultar faturas emitidas/i).first().click();
  await page.waitForLoadState('networkidle');
}

async function baixarBoleto(page, { nomeEmpresa, cnpj }) {
  await navegarParaFaturas(page);

  // "Clique na lupa (ao lado de contrato)" abre uma nova aba de busca.
  const [buscaPage] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('button', { name: /lupa|buscar contrato/i }).first().click(),
  ]);
  await buscaPage.waitForLoadState('domcontentloaded');

  // Busca por CNPJ (mais preciso que nome) — cai pro nome se não tiver CNPJ.
  const termoBusca = cnpj || nomeEmpresa;
  await buscaPage.keyboard.press('Control+F').catch(() => {});
  const campoBusca = buscaPage.getByRole('textbox').first();
  await campoBusca.fill(termoBusca);
  await campoBusca.press('Enter');
  await buscaPage.getByText(termoBusca).first().click();

  // A busca redireciona de volta pra aba original.
  await page.waitForLoadState('networkidle');

  // Seleciona o período (mês atual) e clica na seta verde pra listar, então
  // baixa o boleto mais recente.
  const hoje = new Date();
  const competenciaLabel = hoje.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
  const seletorPeriodo = page.getByLabel(/per.?odo/i);
  if (await seletorPeriodo.count()) await seletorPeriodo.fill(competenciaLabel).catch(() => {});
  await page.getByRole('button', { name: /seta verde|consultar|buscar/i }).first().click();
  await page.waitForLoadState('networkidle');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
    page.getByRole('link', { name: /boleto/i }).first().click(),
  ]);
  if (!download) return null;

  const streamPath = await download.path();
  if (!streamPath) return null;
  return require('fs').promises.readFile(streamPath);
}

module.exports = { operadora: 'AMIL', login, baixarBoleto };
