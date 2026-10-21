# Auditoria de erro recuperável — 21/10/2026

Regra: `docs/ERRO_RECUPERAVEL.md`. Cinco frentes leram o código até o servidor (cliente; produção
criativa; clientes/contratos/cofre; comercial/tarefas; automações/mensagens). Só leitura.
**[conferido]** = conferido de novo no código antes deste resumo. Os demais vêm da auditoria e
devem ser reconfirmados na hora de corrigir.

Gravidade: **alta** = pessoa fica presa, dado errado/duplicado sai para o cliente, ou dado se perde.
**média** = falha parece sucesso, mensagem que não ajuda, ação sensível sem confirmação.
**baixa** = cosmético/raro.

## Já corrigido durante a auditoria
- Cadastro: "Remover" arquivo voltava 401 para o cliente (ação fora da lista pública) — cf68c65.

## 1. O que o cliente usa (link de cadastro, portal, Ficha Viva)
| # | Grav. | Fluxo | Hoje | Correção |
|---|---|---|---|---|
| 1.1 | alta | Cadastro › Acessos ao recarregar | login e "Não tenho/Convite" somem; o salvamento seguinte grava nulo por cima (page.tsx:451-463; route.ts:64-69) | GET devolve *_login e *_status; restaurar; mostrar "senha já recebida" |
| 1.2 | alta | Cadastro › envio final | grava facebook/instagram/google_ads_login e notes mesmo vazios: apaga logins da ficha e troca as notas internas do time (route.ts:491-500) | só gravar o que veio preenchido; observação do cliente em campo próprio |
| 1.3 | alta | Ficha Viva › Raio-X | respostas somem ao trocar de aba/recarregar; "atualizar" abre vazio e duplica (FichaVivaClient.tsx:160,336,368) | estado no pai + rascunho + pré-carregar a última resposta |
| 1.4 | alta | Portal › Vendas | sem gasto lido (todo dia 1º) mostra "custo por venda R$ 0,00" (vendas-server.ts:43-45) | investimento null → "—, ainda não apurado" |
| 1.5 | média | Cadastro › vários arquivos | limite de 1 upload por IP a cada 5 s: 2º e 3º arquivo da seleção levam 429 (upload/route.ts:24-28) | N por minuto por token, reenvio automático, listar o que não subiu |
| 1.6 | média | Cadastro › login sem senha | aparece "Preenchido"; time recebe login sem senha (page.tsx:997-1000) | exigir o par na etapa; Revisão diz "falta a senha" |
| 1.7 | média | Portal › Vendas ao trocar mês | falha deixa os números do mês anterior com o nome do novo (VendasDoCliente.tsx:95-100) | limpar no erro |
| 1.8 | média | Portal/Ficha Viva › valores | "1.500" vira R$ 1,50; "45.000" vira R$ 45 (vendas.ts:51-52) | ponto de milhar + máscara + "vai salvar R$ …" |
| 1.9 | média | Cadastro › abrir link | rede/deploy/erro de banco viram "Link inválido" sem tentar de novo (page.tsx:477-479; route.ts:81) | 503 ≠ 404; "não consegui abrir agora" + botão |
| 1.10 | média | Cadastro › erro no envio | aviso no topo, longe do botão; texto cru do Postgres (page.tsx:686-690) | erro junto do botão, frase humana |
| 1.11 | média | Portal › Enviar material | envia ao escolher, sem lista, sem remover; 1 mensagem por arquivo no grupo (PortalUpload.tsx:102) | lista com Remover + botão Enviar; apagar enquanto não aberto |
| 1.12 | média | Pedido de acesso (/onboarding/acesso) | fecha no 1º envio; senha errada não se corrige (acesso/route.ts:58-60) | aceitar reenvio até o time testar |
| 1.13 | média | Cadastro › upload em campo múltiplo (cliente ativo) | ficha fica só com o último arquivo (upload/route.ts:163) | acrescentar à lista (adicionarDoc) |
| 1.14 | baixa | Cadastro › rascunho | falha só retenta ao digitar; fechar a aba nos 3 s perde (page.tsx:428-441) | retentativa + salvar ao sair (pagehide) |

## 2. Produção criativa (quadros, artes, demandas, envio ao cliente)
| # | Grav. | Fluxo | Hoje | Correção |
|---|---|---|---|---|
| 2.1 | alta | Entregar arte **[conferido]** | manda os ids de TODOS os anexos, inclusive a referência do social; vira "entrega" e pode ir ao cliente (EntregarArteModal.tsx:78-96) | entregar só o que não é referência; banco recusa referência→entrega |
| 2.2 | alta | Enviar pro cliente | só um confirm; sem prévia; sem idempotência; queda no meio mostra "não deu" mas parte saiu; sem imagem manda só o texto (enviar-aprovacao/route.ts:96-117) | prévia (miniaturas, texto, grupo), chave de envio, "enviado em/por", nunca texto sem arte |
| 2.3 | alta | Enviar pro cliente com arte não entregue | botão em qualquer etapa; manda versão reprovada e move o card (enviar-aprovacao:55,73-82) | recusar sem entrega ou com alteração pendente |
| 2.4 | alta | "Aprovado" do cliente no grupo | casa o card entregue mais recente, até em Revisão interna/arquivado; voltar etapa não limpa o selo (inbound:2778-2786; producao.ts:347-365) | só "Com o cliente"; ambíguo pergunta; "não era esta" limpa |
| 2.5 | alta | Aprovar/Solicitar alteração/Arquivar no card | fecham sem o aviso de não salvo; legenda/motivo digitado se perdem (ContentCardModal.tsx:760,779,795) | requestClose; manter campo se falhar |
| 2.6 | alta | Pedir arte por engano | social não consegue voltar o card; sem Desfazer (producao.ts:247,327-331) | Desfazer no aviso ou cancelar enquanto na fila |
| 2.7 | média | Anexar arte | erro some na hora; falha parcial esconde as que subiram (CardArtAttachments.tsx:284-299) | erro visível + recarregar lista |
| 2.8 | média | Voltar etapa | marcas de "No ar"/"Agendado" ficam; PDF ao cliente conta como publicado (producao.ts:360-364) | limpar marcas ao voltar |
| 2.9 | média | Revisão automática | revisa referência como arte; só 6 de N sem dizer; falha não deixa rastro (revisar-entrega:19-40) | só entrega; "conferi X de N"; registrar quando não rodou |
| 2.10 | média | Revisar arte / Revisão final manuais | pegam a 1ª imagem (em geral a referência) (revisar-arte:28-34) | só entrega, todas, mostrar o que viu |
| 2.11 | média | Gerar legenda | substitui sem perguntar; não vê a arte em entrega múltipla (ContentCardModal.tsx:144-158) | sugestão ao lado com Usar/Desfazer |
| 2.12 | média | Pedir arte sem designer | diz "foi pro designer" com pedido sem dono (useProducao.ts:47-52) | avisar "ficou sem designer" |
| 2.13 | média | Modo foco (substituir versão) | lista que não carrega vira vazia: as duas versões vão ao cliente (ModoFoco.tsx:88,138-140) | bloquear substituição sem lista |
| 2.14 | baixa | Legendas em lote | fechar/ESC apaga rascunhos (LegendasEmLote.tsx:89-110) | perguntar antes |
| 2.15 | baixa | Novo conteúdo com referência | sem limite dito; "Criar" de novo duplica referências (social/page.tsx:200-257) | validar ao escolher; reenviar só as que falharam |

## 3. Clientes, contratos e cofre
| # | Grav. | Fluxo | Hoje | Correção |
|---|---|---|---|---|
| 3.1 | alta | Editar cliente (modal) | abre antes dos dados completos e "Salvar" grava null em CPF, endereço e logins (page.tsx:334; EditClientModal.tsx:52,136-156) | travar Editar até carregar, como a aba Dados |
| 3.2 | alta | Ficha Viva › novo link | ficha continua mostrando o link velho (morto); "Copiar" entrega link quebrado; sem confirmação (AbaMarca.tsx:129) | atualizar o extra + confirmar |
| 3.3 | alta | Vincular conta Meta | conta de outro cliente passa para este em silêncio; números de um vão ao outro (ContaMetaAds.tsx:51-71; update/route.ts:189-193) | recusar/confirmar "esta conta é do Cliente X" |
| 3.4 | alta | Documentos legais na ficha | lista vira um arquivo: "Visualizar" falha com 2+, "Substituir" apaga as outras páginas; sem Remover (DadosTab.tsx:258,676,714) | item a item com Ver/Trocar/Remover |
| 3.5 | alta | Cofre › trocar senha | anterior se perde; espelho ao social falha calado e grava texto puro (client-vault/route.ts:130-142) | versão anterior + aviso de falha + espelharNoCofre |
| 3.6 | alta | Contrato › versão e adendo | erro do banco ignorado; fecha como salvo; adendo apaga o texto; lista com erro vira "nenhum contrato" e a versão volta a V1 (ContractGenerator.tsx:185-214,339-346) | rota no servidor; só fechar com sucesso |
| 3.7 | média | Arquivar pela lista | cliente continua na lista (sem realtime); arquivar de novo duplica aviso de churn (clients/page.tsx:202-206) | patch local + Desfazer; rota recusa repetido |
| 3.8 | média | Cadastrar cliente novo | clique duplo cria dois; falha não aparece (NewClientModal.tsx:210-271) | travar botão + erro da rota |
| 3.9 | média | Aprovar cadastro | e-mail de boas-vindas falha calado (401); tela diz que aprovou com e-mail (onboarding/route.ts:751-759) | função interna + "e-mail não enviado" |
| 3.10 | média | Encerrar parceria | gravações sem checar erro; diz concluído com cliente ativo (offboarding/route.ts:182-230) | checar e dizer o que não foi feito |
| 3.11 | média | Carteira/arquivados/material | erro vira lista vazia "Nenhum cliente" (queries.ts:255,276) | estado de erro + tentar de novo |
| 3.12 | média | Trocar logo (aba Marca) | erro de upload não aparece (DadosTab.tsx:463-470) | erro e limite junto do botão |
| 3.13 | média | PDF assinado | sem como trocar um PDF errado (ContractGenerator.tsx:496-506) | "Trocar PDF assinado" |
| 3.14 | baixa | Rejeitar cadastro | confirm sem o nome do cliente | confirmação com nome |
| 3.15 | baixa | Checklist de onboarding | falha desmarca sem dizer (useOperationalStore.ts:152-158) | toast |

## 4. Comercial (CRM) e tarefas
| # | Grav. | Fluxo | Hoje | Correção |
|---|---|---|---|---|
| 4.1 | alta | Sino › "Marcar todas como lidas" **[conferido]** | marca como lidos os avisos de TODO MUNDO (queries.ts:661-663); sem desfazer; falha calada | por pessoa e só os da tela; Desfazer |
| 4.2 | alta | Reimportar planilha | regride etapa/valor de lead que já avançou (ganho/perdido volta), sem "de → para" na prévia (importar.ts:183-197) | prévia campo a campo; não regredir |
| 4.3 | alta | Cancelar reunião | falha do Google ignorada: painel diz "cancelada", lead segue com convite e Meet (reunioes-server.ts:138-143) | só cancelar se o Google cancelou |
| 4.4 | alta | Excluir lead com reunião | apaga a reunião em cascata, evento do Google fica de pé (leads/route.ts:159-170) | cancelar eventos antes ou arquivar |
| 4.5 | média | Abrir WhatsApp conta como contato | clicar já registra "enviado"; cadência anda (crm/page.tsx:352-357) | perguntar "Enviou?" na volta |
| 4.6 | média | Registros do Hoje/reunião | sem desfazer; lote anuncia sucesso mesmo com falha (HojeComercial.tsx:66-76) | Desfazer; contar só sucessos |
| 4.7 | média | Convite da reunião | vai ao e-mail do cadastro mesmo apagado no campo (reunioes-server.ts:61) | só quem está no campo + lista antes |
| 4.8 | média | Loninho marca reunião | cria evento e convida o lead sem conferir dia/hora (assistente-server.ts:150-155) | "confirma?" antes de criar |
| 4.9 | média | Falha do Google parece agenda livre | "Nenhum horário livre" / horários sem conferir conflito (MarcarReuniao.tsx:56-60) | dizer que não leu a agenda |
| 4.10 | média | Importação com leitura falha | lista vazia → duplica o funil inteiro (importar/route.ts:27-40) | abortar; gravar o plano aprovado |
| 4.11 | média | Carga que falha vira vazio | funil vazio, meta R$ 0, "Tudo em dia" no sino (queries.ts:1144-1182) | erro ≠ vazio |
| 4.12 | média | Histórico do lead | campo limpo antes da resposta; texto some se falhar (crm/page.tsx:339-350) | limpar só no sucesso |
| 4.13 | média | Fechar ficha/nova tarefa | Esc/clique fora descarta edições (crm/page.tsx:597-604) | perguntar se há mudança |
| 4.14 | média | Concluir tarefa por engano | some sem Desfazer; antiga pode não aparecer em "Concluídas" (Tarefas.tsx:60-120) | toast Desfazer |
| 4.15 | baixa | Mensagens genéricas | motivo do servidor jogado fora (crm/page.tsx; Tarefas.tsx) | usar `chamar` |

## 5. Automações e mensagens (o que sai pelo WhatsApp)
| # | Grav. | Fluxo | Hoje | Correção |
|---|---|---|---|---|
| 5.1 | alta | Reunião mensal › "ok" do social **[conferido]** | qualquer "ok/sim/👍" no grupo interno confirma a única reunião aguardando e o cliente recebe "Confirmado!"; roda antes do "ok <código>" de card (inbound:1153-1230) | só resposta citando a pergunta, do responsável |
| 5.2 | alta | WhatsApp › nova tentativa e troca de número | timeout repete e cai no número do gestor: relatório/suporte/calendário em dobro (evolution.ts:46-81) | timeout = incerto, não repetir; avisar o time |
| 5.3 | alta | Relatório › reenviar quem ficou de fora **[conferido]** | log "sent" global pula a rodada inteira; force reenvia a todos (weekly-reports:229-236) | dedup só por cliente |
| 5.4 | alta | Relatório mensal fala de anúncio a cliente só de social | folha de anúncios sempre que há conta vinculada (weekly-report.ts:84-87,194) | só com contrato de tráfego |
| 5.5 | alta | Mensagem de qua/sex pela IA (modo on) | pode falar de anúncio a cliente só de social (mensagem-cliente.ts:85-103) | zerar sinais de anúncio sem contrato |
| 5.6 | alta | Broadcast | audiência por conta Meta, não contrato; chave por dia; sem trava de rodada (broadcast/route.ts:64-66) | contrato + chave sem data + trava |
| 5.7 | alta | Loninho › cobrança "pro cliente" | texto (da IA) vai direto ao grupo do cliente; time recebe "✅ mandei" mesmo se falhou (inbound:1615-1687) | prévia + ok; checar envio |
| 5.8 | alta | Calendário em grupo compartilhado **[conferido]** | dedup por cliente: Bazar Ribeiro/Veneza recebem 2x no mesmo grupo (monthly-calendar:199-207) — rotina hoje desligada | um envio por grupo |
| 5.9 | alta | Confirmar demanda | card que falha some: demanda fica "confirmada" sem card (decide/route.ts:94-114) | só confirmar com card criado |
| 5.10 | alta | Loninho › classificação | falha da IA devolve ok; mensagem do cliente se perde (inbound:3228-3232) | fila "não lida" + reprocessar de verdade |
| 5.11 | média | Relatório mensal › quem entra | cliente "at_risk" fica sem relatório (weekly-report.ts:79) | incluir at_risk |
| 5.12 | média | Rotinas com envio falho | véspera, raio-x, datas, reunião respondem ok com envio falso (cs-vespera:187 etc.) | ok = enviado |
| 5.13 | média | Conferência de entrega | erro vira "0 problemas" (entregas.ts:52) | avisar "não consegui conferir" |
| 5.14 | baixa | Conferência do token Meta | ok com token vencido (check-meta-token:48,127) | ok:false + chamada real |
