# CRM do cliente no relatório e no portal

Pedido do Roberto (18/11/2026): "preparar o nosso sistema para ter API de integração com esses outros CRMs. Pode ser o Kommo, pode ser qualquer outro". As métricas que importam entram no relatório semanal, no relatório mensal e no painel de resultados do cliente quando o CRM estiver conectado:

- tempo de atendimento;
- ciclo de venda;
- quantidade de vendas;
- orçamentos;
- etapas do funil.

O Âncora vem primeiro.

## Como funciona

```
Âncora CRM (porta de parceiro, HMAC) ─┐
Kommo (API v4, token do cliente)      ├─ lib/crm-externo ─ MetricasCrm ─┬─ folha "Atendimento e vendas" do PDF (semanal e mensal)
Qualquer CRM → POST /api/crm-externo/eventos ┘   (uma língua só)        └─ aba "Atendimento e vendas" do portal
```

- **Uma língua comum** (`lib/crm-externo/metricas.ts`). Cada CRM é traduzido para `MetricasCrm`. O relatório, o PDF e o portal só conhecem essa forma. Para ligar um CRM novo, basta escrever a tradução dele e um `case` em `lerMetricas` (`lib/crm-externo/servidor.ts`).
- **Um CRM por cliente.** O relatório não soma dois sistemas. Para trocar de CRM, desconecte o atual primeiro.
- **Leitura na hora, sem rotina diária.**
  - O relatório lê o CRM no momento de gerar, sem cache, duas vezes: o período e o anterior, cada um com a janela exata. A regra da comparação é a mesma da Meta e do Google: semana com semana anterior, mês com mês anterior inteiro.
  - O portal lê com cache de 30 minutos (`crm_leituras`), para que cada visita não vá ao CRM do cliente.
- **Falha nunca vira zero** (`docs/ERRO_RECUPERAVEL.md`). Cada métrica tem três estados:
  - **número:** o CRM respondeu (zero é zero de verdade);
  - **indisponível:** o CRM devia ter respondido e não respondeu. A métrica sai do PDF e o time é avisado (no grupo interno, em `parciais`/`errors` da rodada e na ficha, em "Última leitura falhou");
  - **não oferece:** o CRM não tem esse dado (o Kommo não mede tempo de resposta). A métrica não aparece.
  - Se o período inteiro falhar, a folha não entra e o portal mostra "estão sendo atualizados".
- **Sem dado pessoal.** Só passam número e nome de etapa. Nome de contato e de vendedor, telefone e e-mail não entram nos relatórios nem no banco. A API aberta recusa o lote que tiver telefone ou e-mail.
- **Segurança da implantação.** Enquanto a migração não for aplicada, o código funciona como antes: `temTabelasCrm()` confere se as tabelas existem antes de usá-las.

## Os três jeitos de conectar (ficha › Integrações › CRM do cliente)

### Âncora CRM

1. Na ficha, use **Liberar Âncora (gerar link de cadastro)**: escolha o plano e os dias de teste (ou parceria) e envie o link ao cliente. É o mesmo formulário da aba Âncora.
2. Quando o cliente termina o cadastro, **a conexão nasce sozinha**. A detecção roda:
   - antes de cada relatório (semanal e mensal);
   - quando a ficha abre a aba Integrações.

   Isso vale também para quem se cadastrou depois, sem ninguém clicar.
3. O que o Âncora entrega (`GET /api/parceiro/metricas`, assinado):

   | Métrica | Como é contada |
   |---|---|
   | Leads | Contatos que viraram lead no período |
   | Tempo de primeira resposta | Mediana e p90 |
   | Faixas de resposta | Menos de 5 min, de 5 a 10 min, mais de 10 min |
   | Vendas e valor | Vendas fechadas no período |
   | Orçamentos | Negócios criados no período |
   | Ciclo | Mediana da criação do negócio ao ganho, nas vendas do período |
   | Perdidos | Negócios perdidos no período |
   | Vendas recuperadas | Reversões e reconquistas |
   | Conversão | Coorte dos leads do período |
   | Funil agora | Negócios em aberto em cada etapa, com o nome da etapa |

**Do lado do Âncora**, dois commits na branch `feature/parceiro-metricas-completas`, que o Âncora precisa publicar:

- os blocos `vendas` e `etapas`;
- perdidos e ciclo calculados **só do período**. O `dashboard_vendas` contava o histórico inteiro.

Enquanto o Âncora não publicar, o Lone OS lê a forma antiga: ciclo, perdidos, orçamentos e funil ficam como "não oferece" e o restante aparece normalmente.

Para tirar um cliente do Âncora do relatório, use **Pausar**. Desconectar não adianta: a detecção cria a conexão de novo.

### Kommo

1. Na conta Kommo do cliente, vá em Configurações › Integrações › **Criar integração** (privada) › aba **Chaves e escopos** e copie o **token de longa duração**.
2. Na ficha, clique em **Conectar Kommo** e informe o endereço (`minhaempresa.kommo.com`) e o token.
   - O sistema testa o token lendo os funis antes de salvar.
   - O token fica cifrado no banco (`VAULT_KEY`) e não aparece de novo.
   - Token vencido: **Trocar token do Kommo** na ficha. A configuração de funil e etapa continua.
3. Em **Escolher funil e etapa de orçamento**:
   - o funil que entra no relatório (ou todos);
   - a etapa que conta como orçamento. Orçamentos são os negócios que **entraram** nessa etapa no período (eventos `lead_status_changed`). Sem etapa escolhida, o relatório sai sem orçamentos.
4. O que o Kommo entrega:
   - leads (negócios criados no período);
   - vendas e valor (fechados em "ganho", status 142, com o `price`);
   - perdidos (status 143);
   - ciclo (da criação ao fechamento);
   - conversão;
   - orçamentos;
   - funil de agora.

   **Não entrega** tempo de primeira resposta, porque a API não expõe esse dado.
5. **Segurança e limite.** O servidor só chama `*.kommo.com`, `*.amocrm.com` e `*.amocrm.ru` e não segue redirecionamento. As chamadas vão uma de cada vez (o Kommo limita cerca de 7 por segundo) e o 429 é repetido até 3 vezes, respeitando o `Retry-After`.
6. **Funil apagado no Kommo.** Se o funil escolhido deixar de existir, a leitura falha com o motivo ("escolha de novo na ficha"), em vez de voltar zero.

### API aberta (qualquer outro CRM, ou n8n/Make no meio)

1. Na ficha, clique em **Outro CRM (API aberta)**. O token (`lcrm_…`) aparece **uma vez**; do token, o banco guarda só o hash. Gerar outro token desliga o anterior.
2. O CRM de lá manda os eventos:

```
POST https://<endereço do Lone OS>/api/crm-externo/eventos
Authorization: Bearer lcrm_…
Content-Type: application/json

{"eventos": [
  {"id": "evt-1001", "tipo": "lead",      "quando": "2026-11-18T09:12:00-03:00", "negocio": "8812"},
  {"id": "evt-1002", "tipo": "resposta",  "quando": "2026-11-18T09:15:30-03:00", "negocio": "8812", "segundos": 210},
  {"id": "evt-1003", "tipo": "etapa",     "quando": "2026-11-18T10:00:00-03:00", "negocio": "8812", "etapa": "Proposta"},
  {"id": "evt-1004", "tipo": "orcamento", "quando": "2026-11-18T10:05:00-03:00", "negocio": "8812", "valor": 3200},
  {"id": "evt-1005", "tipo": "venda",     "quando": "2026-11-20T16:40:00-03:00", "negocio": "8812", "valor": 3200}
]}
```

**Campos de cada evento:**

| Campo | Obrigatório | O que é |
|---|---|---|
| `id` | sim | Id do evento no sistema de lá. Mandar o mesmo `id` de novo **atualiza** o evento, sem duplicar. |
| `tipo` | sim | `lead`, `resposta`, `orcamento`, `venda`, `perda` ou `etapa` |
| `quando` | sim | Data e hora ISO 8601 **com fuso**. Até 1 dia no futuro e no máximo 2 anos atrás. |
| `negocio` | só em `etapa` | Id **opaco** do negócio no CRM de lá: letras, números e `_ - : .`, sem espaço. Telefone, e-mail e nome são recusados (o `id` do evento também não pode ser telefone ou e-mail). O ciclo e o funil dependem dele. |
| `valor` | não | Em reais (`1250.5`), para `orcamento` e `venda` |
| `segundos` | só em `resposta` | Segundos entre a chegada do lead e a primeira resposta |
| `etapa` | só em `etapa` | Nome da etapa do funil para onde o negócio foi |

**Respostas:**

| Código | Quando acontece |
|---|---|
| `200 {"ok":true,"recebidos":N}` | Lote gravado |
| `422` | O lote inteiro é recusado e `detalhes` lista as linhas erradas. Nada é gravado: corrija e mande de novo. |
| `401` | Token ausente, inválido ou trocado. Conexão **pausada** continua recebendo: pausar só tira do relatório. |
| `429` | Mais de 120 envios por minuto. Mande em lotes de até 500 eventos. |
| `503` | O Lone OS não conseguiu gravar. Nada foi gravado; mande o lote de novo. |

`GET` com o mesmo token só confere se o token vale.

**Regras do relatório:**

- Um tipo que a conexão nunca mandou é tratado como "não oferece". Por exemplo, se o CRM nunca manda `resposta`, o relatório não mostra tempo de resposta (em vez de mostrar zero).
- O ciclo vai do primeiro `lead` do negócio até a `venda`.
- O funil é o **de agora** (como no Âncora e no Kommo): a última `etapa` de cada negócio que não teve `venda` nem `perda` depois dela.
- **Integração parada não vira zero.** Se a conexão não recebe nenhum evento há mais de 7 dias do fim do período (token trocado, fluxo desligado), o período sai como indisponível e o time é avisado. Uma semana sem nenhum evento também cai aqui: é melhor dizer "não sei" do que "zero leads".

## Arquivos

| O quê | Onde |
|---|---|
| Tabelas | `supabase/migrations/20261118150000_crm_conexoes.sql` (`crm_conexoes`, `crm_eventos`, `crm_leituras`, todas com RLS e sem policy) |
| Língua comum, Âncora e eventos (puro) | `lib/crm-externo/metricas.ts` |
| Kommo | `lib/crm-externo/kommo.ts` (puro), `lib/crm-externo/kommo-server.ts` |
| Contrato da API aberta | `lib/crm-externo/eventos.ts`, `app/api/crm-externo/eventos/route.ts` |
| Bloco do relatório (puro) | `lib/crm-externo/relatorio.ts` |
| Conexão, leitura, cache e detecção do Âncora | `lib/crm-externo/servidor.ts` |
| Folha do PDF | `lib/reports/relatorioCrmPdf.ts` (ligada em `relatorioClientePdf.ts`) |
| Relatório semanal e mensal | `lib/traffic/weekly-report.ts`, `app/api/system/weekly-reports`, `app/api/system/client-messages` |
| Portal | `app/api/portal/[token]/crm/route.ts`, `components/portal/PortalCrm.tsx` |
| Ficha (aba Integrações) | `components/client/ficha/AbaIntegracoes.tsx`, `CrmDoCliente.tsx`, `app/api/clients/[id]/crm/route.ts` |
| Formulário do link do Âncora (ficha e aba Âncora) | `components/ancora/AcessoAncora.tsx` |
| Sistema › Integrações | Cartão "Âncora CRM e CRMs dos clientes" |
| Testes | `tests/crm-externo.test.ts` |

A aba **Integrações** da ficha também recebeu a **Lone Academy**, que saiu do Admin. O link antigo `?tab=academy` cai nela. Quem vê a aba:

- **CRM:** gestão e tráfego (só a gestão altera);
- **Academy:** só gestão.

## Para ligar

1. **Banco:** aplique `supabase/migrations/20261118150000_crm_conexoes.sql`. O `deploy.sh` não aplica migração.
2. **Deploy** do Lone OS.
3. **Âncora:** publique os dois commits da branch `feature/parceiro-metricas-completas` pelo `npm run subir` de lá. Sem eles, o Lone OS funciona com a forma antiga (veja acima).
4. **Confira:**
   - em Sistema › Integrações, o cartão "Âncora CRM e CRMs dos clientes";
   - na ficha de um cliente com Âncora, aba Integrações, o botão **Ver os últimos 30 dias**;
   - na prévia `weekly-reports?clientId=<id>&dryRun=1`, a folha "Atendimento e vendas".

## Limites conhecidos

- **Kommo:**
  - não há tempo de primeira resposta;
  - "orçamentos" depende da etapa escolhida;
  - acima de 10 mil negócios num período, a leitura falha de propósito, nomeando o motivo. Uma conta pela metade seria um número errado com cara de certo.
- **Kommo, primeira conta real:** confira a prévia ("Ver os últimos 30 dias") com a tela do Kommo. Os filtros `filter[closed_at]` e `filter[value_after][leads_statuses]` seguem a documentação da API v4, mas ainda não rodaram contra uma conta de verdade.
- **API aberta:** o ciclo e o funil olham os eventos dos últimos 180 dias antes do período. Um negócio parado há mais tempo, sem evento novo, sai do funil.
- **Comparação:** o período anterior é lido no CRM com a sua própria janela. Se o CRM mudar um número antigo (por exemplo, um negócio reaberto), a comparação acompanha.
- **O relatório não passou a sair para quem só tem CRM.** A folha entra no relatório de quem já recebe relatório, ou seja, quem tem Meta, Instagram ou Google.
