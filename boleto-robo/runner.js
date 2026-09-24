// Robô de boletos — framework compartilhado.
// ----------------------------------------------------------------------------
// Cada operadora tem seu próprio módulo em scrapers/<operadora>.js, seguindo
// o procedimento escrito na coluna "Boleto" da planilha original. Este
// arquivo só faz a parte igual pra todas: pega a lista de contratos que
// precisam de boleto este mês, abre o navegador, chama o módulo da
// operadora pra cada cliente, e sobe o PDF pro mesmo lugar que o CRM usa
// (bucket "boletos" + tabela "boletos") — depois disso, o disparo automático
// de e-mail (já configurado no CRM) cuida do resto sozinho.
//
// USO:
//   AMIL_LOGIN=... AMIL_SENHA=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node runner.js amil
//
// IMPORTANTE — leia o README.md desta pasta antes de agendar isto sem
// supervisão. Resumo: este código segue ao pé da letra o passo a passo
// escrito na planilha, mas eu (Claude) NÃO consegui testar contra o site
// real da operadora nesta tarefa — não tenho acesso de rede a esses portais
// nem autorização para tentar logins reais de produção sem alguém
// acompanhando. Ou seja: TRATE ISTO COMO UM PRIMEIRO RASCUNHO, não como
// pronto pra rodar sozinho todo santo dia sem ninguém olhar.
// ----------------------------------------------------------------------------

const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const SCRAPERS = {
  amil: require('./scrapers/amil'),
  porto_seguro: require('./scrapers/porto_seguro'),
  sulamerica: require('./scrapers/sulamerica'),
};

async function main() {
  const operadoraKey = (process.argv[2] || '').toLowerCase();
  const scraper = SCRAPERS[operadoraKey];
  if (!scraper) {
    console.error(`Operadora "${operadoraKey}" não tem módulo ainda. Disponíveis: ${Object.keys(SCRAPERS).join(', ')}`);
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no ambiente.');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const competenciaAtual = new Date();
  const competenciaStr = `${competenciaAtual.getFullYear()}-${String(competenciaAtual.getMonth() + 1).padStart(2, '0')}-01`;

  console.log(`[${operadoraKey}] buscando contratos pendentes de boleto pra competência ${competenciaStr}...`);
  const { data: contratos, error } = await supabase
    .from('contratos')
    .select('id, empresa_id, operadora, dia_vencimento_boleto, empresas(nome, cnpj)')
    .eq('operadora', scraper.operadora)
    .eq('status', 'ativo')
    .not('dia_vencimento_boleto', 'is', null);

  if (error) { console.error('Erro buscando contratos:', error.message); process.exit(1); }
  if (!contratos.length) { console.log('Nenhum contrato ativo cadastrado pra essa operadora.'); return; }

  // Não baixa de novo quem já está com o boleto do mês pronto/enviado.
  const { data: jaProntos } = await supabase
    .from('boletos')
    .select('contrato_id, status')
    .eq('competencia', competenciaStr)
    .in('status', ['baixado', 'enviando', 'enviado']);
  const jaProntosSet = new Set((jaProntos || []).map((b) => b.contrato_id));
  const pendentes = contratos.filter((c) => !jaProntosSet.has(c.id));

  console.log(`${contratos.length} contrato(s) da operadora ${scraper.operadora}, ${pendentes.length} ainda sem boleto este mês.`);
  if (!pendentes.length) return;

  const headless = process.env.DEBUG_HEADFUL !== '1';
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const resumo = { baixados: 0, erros: 0 };

  try {
    console.log(`[${operadoraKey}] fazendo login...`);
    try {
      await scraper.login(page, {
        login: process.env[`${operadoraKey.toUpperCase()}_LOGIN`],
        senha: process.env[`${operadoraKey.toUpperCase()}_SENHA`],
      });
    } catch (loginErr) {
      // Salva um print de como a tela ficou no momento da falha — essencial
      // pra ajustar o script sem precisar abrir o navegador na mão, já que
      // isto normalmente roda sozinho (GitHub Actions).
      await page.screenshot({ path: `erro_${operadoraKey}_login.png`, fullPage: true }).catch(() => {});
      throw loginErr;
    }

    for (const contrato of pendentes) {
      const empresa = contrato.empresas;
      console.log(`  -> ${empresa.nome} (${empresa.cnpj || 'sem CNPJ'})`);
      try {
        const pdfBuffer = await scraper.baixarBoleto(page, {
          nomeEmpresa: empresa.nome,
          cnpj: empresa.cnpj,
        });
        if (!pdfBuffer) {
          console.log('     sem boleto disponível ainda (ok, tenta de novo no próximo dia)');
          continue;
        }
        const path = `contrato_${contrato.id}/${competenciaStr.slice(0, 7)}_boleto.pdf`;
        const { error: upErr } = await supabase.storage.from('boletos').upload(path, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        });
        if (upErr) throw upErr;
        await supabase.from('boletos').upsert(
          { contrato_id: contrato.id, competencia: competenciaStr, status: 'baixado', storage_path: path, origem: 'robo', updated_at: new Date().toISOString() },
          { onConflict: 'contrato_id,competencia' },
        );
        resumo.baixados++;
        console.log('     baixado e anexado no CRM.');
      } catch (err) {
        resumo.erros++;
        console.error(`     ERRO em ${empresa.nome}:`, err.message);
        await page.screenshot({ path: `erro_${operadoraKey}_${contrato.id}.png`, fullPage: true }).catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n[${operadoraKey}] fim — baixados: ${resumo.baixados}, erros: ${resumo.erros}`);
}

main().catch((err) => { console.error('Falha geral do robô:', err); process.exit(1); });
