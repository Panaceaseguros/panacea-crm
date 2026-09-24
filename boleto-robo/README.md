# Robô de boletos (retirada automática nas operadoras)

Este é o pedaço que faz o que você pediu como "agente que entra sozinho nos
portais das operadoras" — a parte que hoje o pós-vendas faz manualmente
(logar em cada site, achar o cliente, baixar o boleto). Uma vez que o PDF
está baixado, ele entra automaticamente no mesmo lugar que a aba "Boletos"
do CRM usa (bucket de Storage + tabela `boletos`), e o disparo por e-mail
que já está configurado (7 dias antes do vencimento) cuida do resto sozinho
— o robô e o CRM não precisam saber um do outro além disso.

Ele roda sozinho, todo dia, pelo **GitHub Actions** (o mesmo GitHub que já
hospeda o app) — sem servidor pago, sem computador ligado.

## Onde ele roda e como acionar um teste

O robô mora no arquivo `.github/workflows/boletos.yml`, dentro deste mesmo
repositório. Pra testar manualmente (sem esperar o agendamento automático):

1. No GitHub, abra a aba **Actions** (no menu de cima do repositório).
2. Na lista da esquerda, clique em **Robo de Boletos**.
3. Clique no botão **Run workflow** (canto direito).
4. No campo **operadora**, digite o nome de uma operadora pra testar só ela
   (`amil`, `porto_seguro` ou `sulamerica`) — ou deixe em branco pra rodar as
   três de uma vez.
5. Clique em **Run workflow** de novo pra confirmar.
6. Espere alguns minutos e atualize a página — vai aparecer uma linha com o
   resultado (✅ verde deu certo, ❌ vermelho falhou em algum ponto).

O agendamento automático diário (rodar sozinho todo dia, sem ninguém
precisar clicar em nada) está **desligado de propósito** até validarmos
cada operadora pelo menos uma vez com o "Run workflow" acima — os detalhes
de como religar estão dentro do próprio arquivo `boletos.yml`, na seção
`schedule`.

## O que fazer quando der ❌ (vermelho)

Isso é esperado no início — os scripts foram escritos seguindo o passo a
passo da planilha, mas eu (Claude) não consegui abrir o site real de
nenhuma operadora ainda pra validar, então algum seletor de campo/botão
provavelmente vai precisar de ajuste.

1. Clique na execução que falhou (a linha vermelha).
2. Desça até **Artifacts**, no final da página — vai ter um arquivo tipo
   `erro-amil.zip`.
3. Baixe e abra esse zip — tem um print exato da tela no momento da falha.
4. Me manda esse print aqui na conversa, me diga qual operadora era, e eu
   ajusto o script (`scrapers/<operadora>.js`) e te aviso quando puder
   testar de novo.

Isso é justamente o "fazer junto" — cada rodada de teste me dá a
informação que falta (como o site realmente é) pra deixar certo.

## Secrets que precisam estar cadastrados no GitHub

Em **Settings → Secrets and variables → Actions → New repository secret**,
cadastre cada um destes (nome exatamente como está aqui, valor é o dado
real):

| Nome do secret              | O que colocar                                         |
|------------------------------|--------------------------------------------------------|
| `SUPABASE_URL`               | URL do projeto (Supabase → Settings → API)             |
| `SUPABASE_SERVICE_ROLE_KEY`  | Chave "secreta" do projeto (a `service_role`, **não** a `anon`) |
| `AMIL_LOGIN`                 | CPF de corretor usado no portal da AMIL                |
| `AMIL_SENHA`                 | Senha desse login                                       |
| `PORTO_SEGURO_LOGIN`         | CPF de corretor usado no portal da Porto Seguro         |
| `PORTO_SEGURO_SENHA`         | Senha desse login                                       |
| `SULAMERICA_LOGIN`           | Login de corretor usado no portal da Sulamerica         |
| `SULAMERICA_SENHA`           | Senha desse login                                       |

Essas credenciais já estão na planilha original que você me mandou — é só
copiar de lá. Elas ficam guardadas de forma protegida pelo GitHub (nem eu
consigo ver o valor depois de cadastrado, só o robô consegue usar durante a
execução) e nunca aparecem no código.

## Leia isto antes de confiar no robô sem supervisão

- Os nomes de campo/botão no código (`"Usuário Corretor"`, `"CPF"`, `"login"`
  etc.) são exatamente os da planilha, mas cada portal pode ter mudado de
  layout desde que a planilha foi escrita — por isso o passo de validação
  acima (Run workflow → olhar o print de erro → ajustar) é obrigatório
  antes de confiar 100% em qualquer operadora.
- CAPTCHA e autenticação em duas etapas: se alguma operadora tiver algum
  desses no login, a automação para nesse ponto — não existe forma de
  contornar isso de forma confiável. Nesse caso o cliente cai de volta pro
  fluxo manual (é por isso que o CRM sempre permite anexar o PDF na mão
  também — o robô nunca é o único caminho).
- Login/senha de portal só ficam como GitHub Secret — nunca direto no
  código nem em planilha compartilhada.

## Operadoras já com script (AMIL, PORTO SEGURO, SULAMERICA)

Juntas cobrem 133 dos 275 contratos da planilha original. Nenhuma delas foi
validada contra o site real ainda — o próximo passo é rodar o "Run
workflow" pra cada uma e ajustar pelos prints de erro, como explicado acima.

## Próximas operadoras, por volume de clientes

| Operadora        | Clientes | Observação                                                   |
|-------------------|---------:|----------------------------------------------------------------|
| GNDI              |       96 | Maior volume, mas login é via B2C/OAuth da Hapvida — fluxo mais complexo, deixei por último de propósito |
| ALICE             |       16 | Parte dos clientes está marcada na planilha como "sem acesso ao boleto pelo portal" — precisa confirmar caso a caso |
| BRADESCO          |       10 |                                                                  |
| HAPVIDA           |        5 |                                                                  |
| AMEPLAN           |        4 |                                                                  |
| AMIL DENTAL       |        3 | Pode reaproveitar boa parte do `scrapers/amil.js`               |
| SANTA HELENA      |        3 |                                                                  |
| MED TOUR          |        2 |                                                                  |
| BRADESCO ODONTO   |        1 |                                                                  |
| TRASMONTANO       |        1 |                                                                  |
| MEDSÊNIOR         |        1 |                                                                  |

O padrão pra adicionar cada uma (eu faço a parte de escrever o código; você
só precisa testar e me mandar o print quando falhar):

1. Copio `scrapers/amil.js` pra `scrapers/<operadora>.js`, adaptando pro
   texto da coluna "Boleto" daquela operadora.
2. Registro no `runner.js` (objeto `SCRAPERS`) e no `boletos.yml`
   (lista `matrix.operadora` e os secrets novos).
3. Você roda o "Run workflow" preenchendo o nome da operadora nova (o job
   `testar-operadora-nova` do workflow cuida disso mesmo antes dela entrar
   na lista principal).
4. Ajustamos junto pelos prints até funcionar de ponta a ponta.
5. Só depois disso ela entra no agendamento automático diário.

## Como testar no seu próprio computador (opcional)

Se preferir ver o navegador abrindo de verdade enquanto testa (mais fácil
de entender o que travou do que só o print), e tiver Node.js instalado:

```bash
cd boleto-robo
npm install
npx playwright install chromium   # baixa o Chromium do Playwright, 1x só

AMIL_LOGIN="..." \
AMIL_SENHA="..." \
SUPABASE_URL="https://SEU-PROJETO.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="..." \
DEBUG_HEADFUL=1 \
npm run amil
```

Isso é opcional — o fluxo pelo GitHub Actions (Run workflow + print de
erro) funciona sem precisar instalar nada.

## O que acontece quando um cliente falha

O robô nunca para o lote por causa de 1 erro — ele pula pro próximo cliente
e segue. Cada erro tira um print (`erro_<operadora>_<contrato>.png` ou
`erro_<operadora>_login.png`, guardados no artifact do GitHub Actions) e
aquele cliente simplesmente continua "aguardando arquivo" na aba Boletos do
CRM — o pós-vendas vê e pode anexar manualmente sem esperar o robô ser
corrigido.
