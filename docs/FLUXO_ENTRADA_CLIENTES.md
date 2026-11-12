# Entrada de clientes: o processo proposto × o que o Lone OS faz (12/11/2026)

Origem: "Fluxo Completo Lone Mídia — Proposta operacional v1.0" (Roberto, 12/11/2026), que descreve a jornada do
lead até o cliente ativado. Este documento compara a proposta com o código de `deploy/budget-only` em 6384a9a0 e com
`lone-finance`, e registra o diagnóstico das duas falhas relatadas (pasta do Drive e envio à D4Sign).

O processo para o time está em **Processos › COM-01** (`lib/processos/conteudo-inicial.ts`), escrito como
processo-alvo: cada passo traz "HOJE NO SISTEMA" quando o Lone OS ainda não faz o que o processo pede.

O PDF original não está no repositório (é de uso interno, com nome e valor de cliente, e o repositório é público).

## Resumo

A jornada existe de ponta a ponta, mas como chamadas diretas, rotinas agendadas e avisos no grupo de cadastro, com o
estado espalhado em várias colunas. A proposta descreve uma máquina de estados com portões, acordo congelado na venda,
aprovação formal do contrato e cobrança automática no Asaas. Isso ainda não existe.

Já sólido: envio à D4Sign em etapas e sem duplicar, aviso de assinatura parcial e final, pasta do Drive que não
duplica, um lead igual a um cliente, avisos sem dado sensível.

## Etapa por etapa

| Etapa da proposta | Hoje | Onde |
|---|---|---|
| Cadastro mínimo do lead | Só o nome do contato é obrigatório; serviço não é campo do lead | `app/api/crm/leads/route.ts` |
| Deduplicação por CNPJ, telefone e empresa | Só no Loninho de vendas e na importação; a tela não confere; lead sem CNPJ | `lib/crm/assistente.ts`, `lib/crm/importar.ts` |
| Cadência D1 a D5 em dias úteis, com tarefa criada | Régua por etapa, em dias corridos, calculada na aba Hoje; não cria tarefa | `lib/crm/cadencia.ts`, `lib/crm/hoje.ts` |
| Parar a cadência quando o lead responde | Não existe detecção de resposta; só mudança de etapa ou "Retomar em" | `lib/crm/registrar-atividade.ts` |
| Cadência concluída sem encerrar o lead | Existe ("Régua encerrada" pede decisão) | `lib/crm/cadencia.ts` |
| Alerta de follow-up atrasado | Existe (`crm-followups`, `crm-lead-novo`) | `lib/crm/avisos.ts` |
| Botão "Fechar venda" com campos obrigatórios | Não existe; Ganho não exige nada | `app/api/crm/leads/route.ts` |
| Acordo congelado (snapshot) | Não existe; contrato e Finance leem o valor atual do lead | `lib/contracts/valor-da-venda.ts`, `lib/integracoes/finance-vendas.ts` |
| Link único de cadastro por venda | Existe (índice único em `source_lead_id`, 409 no segundo clique) | `app/api/onboarding/route.ts` |
| Aviso ao grupo sem dado sensível | Existe | `app/api/onboarding/route.ts` |
| Formulário pré-preenchido | Só para cliente antigo; cliente novo redigita | `app/onboarding/[token]/page.tsx` |
| Enviado × aprovado | Existe (`draft_status`: `pending_invite` → `awaiting_approval` → nulo) | `app/api/onboarding/route.ts` |
| CS confere representatividade do signatário | Sem checagem; aprovar é um clique | `app/clients/pending/page.tsx` |
| Drive com 8 subpastas | 2 subpastas (Documentos, Fotos e Vídeos); nasce no envio do cadastro | `lib/drive/pasta-cliente.ts` |
| Minuta só depois do cadastro aprovado | Oferecida no envio do cadastro, antes da revisão | `app/api/onboarding/route.ts`, `app/api/cs/inbound/route.ts` |
| Minuta reaproveita valor e vigência | Valor sim; vencimento sempre perguntado; vigência é o padrão da casa | `lib/contracts/valor-da-venda.ts` |
| Quatro datas distintas | `start_date`, `end_date`, `payment_day` (dia, não data); primeiro vencimento não é data | `lib/contracts/registrar-do-grupo.ts` |
| Auditoria antes de aprovar | Só no caminho do grupo e de `/api/cs/contrato`; o gerador da ficha não passa; cargo e e-mail ausentes só alertam | `lib/contracts/validacao.ts` |
| PDF com ID, versão e hash | Versão sim; hash só do PDF assinado baixado da D4Sign | `lib/contracts/arquivo-d4sign.ts` |
| Gerar, aprovar, enviar, confirmar | Sem estado "aprovado"; o clique de envio (gestão, com prévia) é a aprovação | `lib/contracts/enviar-d4sign.ts` |
| "ok" no WhatsApp não envia | Garantido: só a tela chama o envio | `app/api/contracts/d4sign/enviar/route.ts` |
| Status por webhook | Parcial e concluído sim; cancelado solta o contrato; recusa e e-mail devolvido sem tratamento | `lib/contracts/assinatura.ts` |
| PDF final arquivado | No storage do Lone OS, não no Drive; `status` do contrato não vira `active` sozinho | `lib/contracts/arquivo-d4sign.ts` |
| Cobrança no Asaas após assinatura | Não existe código de Asaas (só schema e spec no `lone-finance`) | `lone-finance/docs/spec-asaas-financial-sync-2026-09.md` |
| Portões de ativação e exceção registrada | Não existem; aprovar o cadastro ativa o cliente | `app/clients/pending/page.tsx` |
| Tarefas de grupo e por serviço | Existem | `lib/clients/conversao.ts`, `lib/cs/setup-7dias.ts` |
| Acompanhamento 7/14/30 | Setup de 7 dias cobrado até 15; marcos de 3 e 6 meses | `lib/cs/setup-cobranca.ts` |
| Eventos (`sale.closed_won`, `contract.signed`...) | Sem barramento para a jornada; a `outbox` só cobre conteúdo e arte | `supabase/migrations/20260914090000_outbox_e_fila.sql` |
| Tempo venda → ativação | Não medido; `activated_at` e `ttv_days` nunca são gravados | `lib/supabase/queries.ts` |
| Painel por cliente (etapa, parado há, responsável, bloqueio, próxima ação) | Espalhado: aba Fechados, mensagem das 8h30, Jornada do CS | `lib/crm/fechados.ts`, `lib/contracts/assinatura.ts` |

## Os dez testes de aceite da proposta

| # | Teste | Cobertura |
|---|---|---|
| 1 | Valor e vigência da venda não são perguntados de novo | Parcial |
| 2 | Venda duplicada não recria nada | Parcial (falta teste do 409) |
| 3 | Signatário sem cargo bloqueia o envio | Não. O código só alerta (`tests/contrato-validacao.test.ts`) |
| 4 | "Hoje" vira data absoluta | Não |
| 5 | "Ok" genérico não envia | Parcial (garantia estrutural, sem teste que a afirme) |
| 6 | Falha da D4Sign cria pendência | Sim para cancelamento e e-mail fora do cadastro; não para recusa e devolução |
| 7 | Webhook do Asaas duplicado | Não (não há código) |
| 8 | Pasta do Drive existente não é recriada | Parcial (`lib/drive/sincronizar-pasta.ts` sem teste) |
| 9 | Lead responde e os follow-ups param | Não (funcionalidade inexistente) |
| 10 | Cliente bloqueado não vira ativo | Não (não há portão) |

## Diagnóstico: a pasta do Drive não nasceu

Verificado em 12/11/2026: o Drive da conta da Lone não tem nenhuma pasta "Clientes Lone Mídia". O Lone OS nunca criou
nem a raiz, então a falha é geral e anterior a qualquer cliente. O servidor de produção não foi lido nesta análise;
as causas abaixo estão em ordem de probabilidade e cada uma tem a forma de confirmar.

1. **A conexão do Google é anterior a 09/11/2026 e não tem o escopo `drive.file`.** O escopo entrou em
   `lib/prospeccao/google.ts` nesse dia. Confirmar e corrigir: Sistema › Integrações › "Reconectar Google", aceitando o
   Drive.
2. **A Google Drive API está desligada no projeto do Google Cloud.** O teste da credencial não detecta; a ficha mostra
   o link para ativar.
3. **A migration `20261109120000_pasta_drive_cliente.sql` não foi aplicada em produção.** O `deploy.sh` não aplica
   migrations. Sem as colunas `drive_*`, a trava falha e a função devolve o erro sem gravar `drive_erro` nem avisar o
   grupo (`lib/drive/sincronizar-pasta.ts`, retorno em `eTrava`): só sai no log. É a única causa que explica falha sem
   nenhum aviso, e esse retorno mudo contraria `docs/ERRO_RECUPERAVEL.md`.
4. **O cadastro não chegou ao fim.** Até 6384a9a0 (11/11), "Criar cadastro e enviar link" falhava para todo lead com
   canal de venda preenchido.

Nas causas 1 e 2 o grupo de cadastro recebe "Pasta do Drive não criada" e a ficha mostra o motivo em Marca & Briefing
› Pasta do Drive. Sem aviso em lugar nenhum, é a 3 ou a 4.

Depois de corrigir, os clientes que ficaram sem pasta entram por `POST /api/system/drive-pastas?criar=1` (lista
primeiro com GET; padrão de 10 por chamada).

## Diagnóstico: o contrato não foi para a D4Sign

- **Não há envio automático.** O contrato só sai quando alguém da gestão clica "Enviar para assinatura" na ficha ›
  Contratos e confirma a prévia. Nenhuma rotina, agente ou mensagem de WhatsApp chama o envio.
- Se o clique foi dado e falhou, o motivo fica em `contracts.d4sign_envio_erro` e aparece na tela. Bloqueios possíveis:
  - cliente sem e-mail válido no cadastro;
  - contrato sem PDF guardado (`pdf_url`);
  - nenhum cofre escolhido ou e-mail de quem assina pela Lone ausente (Configurações › Jurídico › D4Sign);
  - limite de 10 chamadas por hora da conta: a consulta horária usa até 6, a prévia 1 e o envio 3;
  - migration `20261028150000_contrato_envio_d4sign.sql` não aplicada (a reserva do envio falha com "coluna não existe").

## Decisões que a gestão ainda precisa tomar (da proposta)

- Pagamento confirmado é exigido antes do kickoff? Quais exceções valem?
- Quem aprova contrato, mudança de escopo e início antecipado?
- Quais modelos e campos são obrigatórios por serviço (Growth, Tráfego, Social Media, Site)?
- Qual o prazo de cada etapa e quem assume o cliente depois da venda?
- O vencimento recorrente segue sempre o primeiro vencimento?

## Ordem sugerida de construção (fases da proposta, ajustadas ao que já existe)

1. **P0** Fechar venda com campos obrigatórios e acordo congelado; contrato só após cadastro aprovado; auditoria nos
   dois caminhos de geração; signatário sem cargo bloqueia; erro mudo do Drive corrigido; migrations no deploy.
2. **P1** Estado "aprovado" do contrato ligado a versão e hash; recusa e devolução da D4Sign; PDF assinado no Drive;
   painel único de pendências por cliente.
3. **P2** Asaas (cobrança, webhook idempotente, atraso); portões de ativação com exceção registrada; `activated_at` e
   tempo venda → ativação; acompanhamento 7/14/30.
