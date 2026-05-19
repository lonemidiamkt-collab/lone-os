# Lone OS — Documentação Técnica Completa do Sistema

**Data de geração:** 11 de maio de 2026  
**Versão do sistema:** produção ativa em https://painel.lonemidia.com  
**Empresa:** LM Assessoria e Marketing LTDA (Lone Midia)  
**Objetivo deste documento:** Análise completa para identificação de melhorias, bugs e oportunidades de evolução

---

## 1. VISÃO GERAL DO SISTEMA

Lone OS é um **sistema de gestão operacional interna** para uma agência de marketing digital. Centraliza o trabalho de 5 papéis operacionais (Admin/CEO, Gerente, Tráfego Pago, Social Media, Designer) em uma única plataforma web. O sistema não é público — é acessado apenas pela equipe interna da agência.

### Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 15 (App Router, React 18, TypeScript) |
| Estilização | Tailwind CSS 3.4, Radix UI, Framer Motion |
| Backend/API | Next.js API Routes (Node.js runtime) |
| Banco de dados | PostgreSQL 16 via Supabase (self-hosted) |
| Autenticação | Supabase Auth (JWT, cookie-based) |
| Armazenamento | Supabase Storage (buckets: onboarding, assets, contracts, arts) |
| IA | OpenAI GPT (analyze-ads, morning briefing, audits) |
| Email | Resend API |
| Criptografia | AES-256 (vault de senhas de clientes) |
| Deploy | Docker + Docker Compose no VPS Hostinger KVM 1 |
| Proxy/SSL | Nginx + Cloudflare (proxied) |
| Gráficos | Recharts |
| PDF | jsPDF + html2canvas + @react-pdf/renderer |
| Notificações in-app | Sonner (toast) |

### Infraestrutura de produção

- **VPS:** Hostinger KVM 1 — 1 vCPU, 4GB RAM, 50GB NVMe
- **IP:** 72.60.142.252
- **Domínio:** painel.lonemidia.com (Cloudflare proxied, SSL automático)
- **Containers Docker em execução:**
  - `loneos-app-1` — Next.js standalone (porta 3000)
  - `supabase-kong-1` — API Gateway do Supabase
  - `supabase-db-1` — PostgreSQL 16
  - `supabase-auth-1` — GoTrue (autenticação)
  - `supabase-rest-1` — PostgREST (auto-geração de API REST)
  - `supabase-storage-1` — Armazenamento de arquivos
  - `supabase-imgproxy-1` — Processamento de imagens
  - Nginx (reverse proxy porta 80 → 3000)
  - **Nota:** `supabase-realtime` está **desabilitado** intencionalmente para economizar RAM
- **Banco de dados:** Supabase acessado internamente via `http://supabase-kong-1:8000` (bypass do Nginx)

---

## 2. ARQUITETURA DO FRONTEND

### Estrutura de contextos React

O sistema usa dois contextos React globais que carregam e mantêm todo o estado da aplicação:

**`RoleContext`** — gerencia autenticação de papel:
- `role`: papel atual ("admin" | "manager" | "traffic" | "social" | "designer")
- `currentUser`: nome do usuário atual
- Funções de login/logout

**`AppStateContext`** — gerencia todo o estado operacional:
- `clients` — lista de clientes com todos os campos
- `contentCards` — cards de conteúdo do kanban Social Media
- `designRequests` — solicitações ao designer
- `timeline` — histórico operacional por cliente
- `clientChats` — chat interno por cliente
- `onboarding` — checklists de onboarding por cliente
- `creativeAssets` — ativos criativos da Creative Wallet
- `socialProofs` — provas sociais por cliente
- `crisisNotes` — notas de crise por cliente
- `quinzReports` — relatórios quinzenais
- `investmentData` — dados de investimento de tráfego
- `notifications` — notificações in-app

**Fluxo de dados:**  
Toda mutação de estado usa o padrão **optimistic update + rollback**: atualiza o estado React imediatamente e persiste no banco via API Route em background. Se a API falhar, reverte ao estado anterior e exibe notificação de erro.

### AppShell e roteamento

```
layout.tsx (Server Component)
  └── ConditionalAppShell (Client Component)
        ├── LoginScreen (se não autenticado)
        └── AppShell
              ├── Sidebar (navegação lateral)
              ├── Header (troca de papel, busca global)
              └── {children} (conteúdo da rota)
```

O middleware Next.js valida a sessão Supabase em todas as rotas, aceitando tanto cookie `sb-*` quanto header `Authorization: Bearer <token>`.

---

## 3. ROTAS / PÁGINAS

### Páginas públicas / de sistema
| Rota | Descrição |
|---|---|
| `/` | Dashboard — métricas do dia, feed de atividade, avisos |
| `/onboarding/[token]` | Portal de onboarding para o cliente (público, acesso por token único) |

### Páginas internas (requerem autenticação)
| Rota | Descrição | Papéis |
|---|---|---|
| `/clients` | Lista de clientes com health score, filtros e modal de novo cliente | Todos |
| `/clients/[id]` | Perfil completo do cliente — 12 abas | Todos (conteúdo varia por papel) |
| `/clients/pending` | Clientes rascunho aguardando aprovação | Admin/Manager |
| `/traffic` | Painel de Tráfego Pago — campanhas Meta Ads, relatórios 7d | Traffic, Admin |
| `/traffic/budgets` | Monitoramento de Saldos Meta Ads — saldo em tempo real | Traffic, Admin |
| `/social` | Painel Social Media — kanban de conteúdo, calendário | Social, Admin |
| `/design` | Fila do Designer — design requests por prioridade | Designer, Admin |
| `/communications` | Central de Comunicação — chat global + chats por cliente | Todos |
| `/ceo` | Área CEO — PIN 1234, análises estratégicas, churn | Admin/CEO |
| `/churn` | Termômetro de Churn — health scores, clientes em risco | Admin/Manager |
| `/defesa` | Defesa Ativa — alertas de anomalia nas métricas Meta | Traffic, Admin |
| `/contratos` | Gestão de Contratos — gerador, upload, tracking de assinatura | Admin/Manager |
| `/automations` | Motor de automações — regras de SLA, cronogramas | Admin |
| `/broadcasts` | Broadcasts — envio de comunicações em massa | Admin/Manager |
| `/calendar` | Calendário — feriados, agenda, observâncias | Todos |
| `/goals` | Metas e OKRs da agência | Admin/Manager |
| `/integrations` | Integrações externas (Meta, Google, etc.) | Admin |
| `/settings` | Configurações do sistema | Admin |
| `/my-work` | Visão pessoal — tarefas e conteúdos do usuário logado | Todos |
| `/sobre` | Sobre o sistema | Todos |

### Abas do perfil do cliente (`/clients/[id]`)

| Aba | Descrição |
|---|---|
| Visão Geral | Resumo do cliente, Meta Ads picker, equipe, health, timeline rápida |
| Dados | Dados cadastrais completos, cofre de acessos (RBAC), endereço |
| Resultados | Relatório de campanhas Meta Ads (7/14/30d), gráficos, PDF export |
| Análise IA | Auditorias automáticas de campanhas geradas por GPT |
| Contratos | Gerador de contratos DOCX + upload de contratos legados assinados |
| Chat | Chat interno da equipe sobre este cliente |
| Histórico | Timeline operacional completa (todas as ações registradas) |
| Tarefas | Tasks do cliente com status, prioridade, timesheet invisível |
| Conteúdo | Cards de conteúdo do cliente |
| Onboarding | Checklist de onboarding com progresso |
| Creative Wallet | Ativos criativos (referências, paleta, tipografia, logo) |
| Relatórios | Relatórios quinzenais |

---

## 4. API ROUTES (Backend)

### Módulo de Clientes
| Endpoint | Método | Função |
|---|---|---|
| `/api/clients/update` | POST | Atualiza dados do cliente (RBAC por campo) |

### Módulo de Conteúdo
| Endpoint | Método | Função |
|---|---|---|
| `/api/content-cards/create` | POST | Cria card de conteúdo |
| `/api/content-cards/update` | POST | Atualiza card de conteúdo |
| `/api/content-cards/delete` | POST | Remove card de conteúdo |

### Módulo de Tarefas
| Endpoint | Método | Função |
|---|---|---|
| `/api/tasks/create` | POST | Cria tarefa com assignee e timeline |
| `/api/tasks/update` | POST | Atualiza status/campos da tarefa |
| `/api/tasks/delete` | POST | Remove tarefa com rollback |

### Módulo de Design
| Endpoint | Método | Função |
|---|---|---|
| `/api/design-requests/create` | POST | Cria design request |
| `/api/design-requests/update` | POST | Atualiza status/campos |
| `/api/design-requests/delete` | POST | Remove design request |
| `/api/upload-art` | POST | Upload de arte finalizada para Supabase Storage |

### Módulo de Onboarding
| Endpoint | Método | Função |
|---|---|---|
| `/api/onboarding` | GET/POST | Lê/atualiza checklist de onboarding |
| `/api/onboarding/upload` | POST | Upload de documentos do cliente |

### Módulo de Tráfego / Meta Ads
| Endpoint | Método | Função |
|---|---|---|
| `/api/traffic/sync-balances` | GET | Retorna saldos do DB (sem chamar Meta) |
| `/api/traffic/sync-balances` | POST | Chama Meta API batch, atualiza DB |
| `/api/traffic/ad-accounts` | GET | Lista contas Meta disponíveis para vincular |
| `/api/traffic/ad-accounts` | POST | Vincula nova conta ao DB + sync |
| `/api/traffic/budget-rules` | GET/POST/DELETE | CRUD de regras de alerta de saldo |
| `/api/traffic/billing-type` | POST | Altera tipo de cobrança (pré/pós-pago) |

### Módulo Meta OAuth
| Endpoint | Método | Função |
|---|---|---|
| `/api/meta/token` | GET/POST | Lê/salva token Meta na agency_settings |
| `/api/meta/exchange-token` | POST | Troca code OAuth por long-lived token |

### Módulo de IA
| Endpoint | Método | Função |
|---|---|---|
| `/api/ai/analyze-ads` | POST | GPT analisa campanhas do cliente (com cache) |
| `/api/ai/morning-briefing` | POST | GPT gera briefing matinal da agência |
| `/api/ai/audits` | GET | Retorna auditorias IA salvas por cliente |
| `/api/ai/critical-alerts` | GET | Alertas críticos gerados por IA |

### Módulo de Contratos
| Endpoint | Método | Função |
|---|---|---|
| `/api/contracts/download-docx` | POST | Gera e baixa contrato em DOCX (template preenchido) |
| `/api/contracts/list` | GET | Lista contratos por cliente |
| `/api/contracts/upload-signed` | POST | Upload de contrato assinado |
| `/api/contracts/upload-legacy` | POST | Upload de contrato legado (PDF) |

### Módulo de Sistema / Crons
| Endpoint | Método | Função |
|---|---|---|
| `/api/system/compute-health` | POST | Calcula Churn Risk Score para todos os clientes |
| `/api/system/defense-scan` | POST | Detecta anomalias nas métricas Meta |
| `/api/system/contract-renewal` | POST | Verifica contratos próximos do vencimento |
| `/api/system/followup` | POST | Envia follow-ups automáticos |
| `/api/system/holiday-alert` | POST | Alerta de feriados próximos |
| `/api/system/cleanup-report` | POST | Limpeza de dados antigos |

### Outros Módulos
| Endpoint | Método | Função |
|---|---|---|
| `/api/broadcasts` | POST | Dispara broadcast para clientes |
| `/api/client-vault` | GET/POST | Lê/salva cofre de senhas do cliente (AES-256) |
| `/api/defense/alerts` | GET | Lista alertas de anomalia Meta |
| `/api/defense/alerts/[id]/acknowledge` | POST | Marca alerta como reconhecido |
| `/api/emails` | POST | Envia email via Resend |
| `/api/health` | GET | Health check da aplicação |
| `/api/holidays/[year]` | GET | Lista feriados do ano |
| `/api/onboarding` | GET | Dados de onboarding por token público |
| `/api/platform-updates` | GET/POST | Atualizações da plataforma (changelog interno) |
| `/api/storage/signed-url` | POST | Gera URL assinada para download de arquivo |
| `/api/sync` | POST | Sincronização manual de dados |

---

## 5. BANCO DE DADOS — SCHEMA COMPLETO

### Tabelas principais

#### `clients`
Tabela central. Cada linha = um cliente da agência.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | Identificador único |
| `name` | TEXT | Nome completo / razão social |
| `nome_fantasia` | TEXT | Nome fantasia |
| `industry` | TEXT | Segmento |
| `status` | ENUM | onboarding / good / average / at_risk |
| `attention_level` | ENUM | low / medium / high / critical |
| `tags` | TEXT[] | Tags livres |
| `monthly_budget` | NUMERIC | Verba mensal de tráfego (R$) |
| `payment_method` | ENUM | pix / boleto / cartao / transferencia |
| `service_type` | TEXT | lone_growth / assessoria_trafego / assessoria_social / assessoria_design |
| `join_date` | DATE | Data de entrada |
| `contract_end` | DATE | Vencimento do contrato |
| `assigned_traffic` | TEXT | Nome do gestor de tráfego |
| `assigned_social` | TEXT | Nome do gestor de social |
| `assigned_designer` | TEXT | Nome do designer |
| `tone_of_voice` | TEXT | formal / funny / authoritative / casual |
| `drive_link` | TEXT | Link do Google Drive |
| `instagram_user` | TEXT | Usuário do Instagram |
| `meta_ad_account_id` | TEXT | ID da conta Meta Ads (act_XXXX) |
| `meta_ad_account_name` | TEXT | Nome da conta Meta Ads |
| `cpf_cnpj` | TEXT | CPF ou CNPJ (ADMIN ONLY via RLS) |
| `phone` | TEXT | WhatsApp |
| `email` | TEXT | Email de contato |
| `facebook_login` | TEXT | Login Facebook (cofre) |
| `facebook_password` | TEXT | Senha Facebook (cofre, criptografada) |
| `client_finance_phone` | TEXT | WhatsApp do financeiro (para alertas de saldo) |
| `client_pix_key` | TEXT | Chave Pix (para mensagens de cobrança) |
| `current_health_score` | NUMERIC | Score de risco de churn 0-100 (cache) |
| `current_health_level` | TEXT | safe / attention / high / critical |
| `nps_score` | NUMERIC | NPS do cliente |
| `first_value_delivered_at` | TIMESTAMPTZ | Quando o primeiro resultado foi entregue |
| `activated_at` | TIMESTAMPTZ | Quando o cliente foi ativado |

#### `ad_accounts`
Uma conta Meta Ads por linha. Um cliente pode ter múltiplas contas.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | ID interno |
| `client_id` | UUID FK | Referência ao cliente |
| `meta_account_id` | TEXT UNIQUE | ID Meta no formato act_XXXX |
| `account_name` | TEXT | Nome da conta no Meta |
| `is_prepaid` | BOOLEAN | true = pré-pago (Pix/Boleto), false = pós-pago (Cartão) |
| `billing_type_source` | TEXT | "auto" (detectado) / "manual" (configurado) |
| `spend_cap` | NUMERIC | Teto de gasto pós-pago (R$) |
| `monthly_budget` | NUMERIC | Verba mensal contratada pós-pago (R$) |
| `last_balance` | NUMERIC | Saldo disponível calculado (R$) |
| `last_amount_spent` | NUMERIC | Gasto acumulado no ciclo (R$) |
| `current_month_spend` | NUMERIC | Gasto do mês corrente via Insights (R$) |
| `daily_spend_3d` | NUMERIC[] | Gastos dos 3 últimos dias |
| `last_3d_avg_spend` | NUMERIC | Média diária dos últimos 3 dias |
| `last_synced_at` | TIMESTAMPTZ | Última sincronização |
| `currency` | TEXT | Moeda (BRL) |
| `account_status` | INT | 1=Ativa 2=Desativada 3=Em revisão 7=Pendente 9=Grace period |
| `sync_error` | TEXT | Mensagem do último erro de sync |
| `last_error_message` | TEXT | JSON completo do erro da Meta API |

#### `budget_alert_rules`
Regras de alerta de saldo por conta.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | ID da regra |
| `ad_account_id` | UUID FK | Conta monitorada |
| `severity` | TEXT | warning / critical |
| `threshold_value` | NUMERIC | Limiar em R$ |
| `repeat_interval_hours` | INT | Intervalo mínimo entre disparos (1-24h) |
| `max_notifications` | INT | Máximo de notificações por ciclo |
| `channels` | TEXT[] | ["whatsapp"] (Slack/email no v2) |
| `is_active` | BOOLEAN | Regra ativa? |

#### `budget_alert_log`
Histórico de alertas disparados.

| Coluna | Tipo | Descrição |
|---|---|---|
| `cycle_key` | TEXT | act_ID\|rule_id\|YYYY-MM-DD (dedup por ciclo) |
| `balance_at_trigger` | NUMERIC | Saldo no momento do disparo |
| `channel` | TEXT | Canal notificado |
| `sent_at` | TIMESTAMPTZ | Quando foi enviado |

#### `content_cards`
Cards de conteúdo do kanban Social Media.

Status do kanban: `ideas → script → in_production → blocked → approval → client_approval → scheduled → published`

Campos especiais:
- `column_entered_at` (JSONB) — rastreamento de SLA por coluna
- `work_started_at` + `total_time_spent_ms` — Timesheet Invisível
- `designer_delivered_at` / `social_confirmed_at` — rastreamento de handoff
- `publish_verify_checks` — checklist de verificação de publicação
- `traffic_suggestion` — sugestão do gestor de tráfego

#### `tasks`
Tarefas operacionais por cliente.

Status: `pending → in_progress → review → done`  
Campos: `assigned_to`, `role`, `priority`, `due_date`, `work_started_at`, `total_time_spent_ms`

#### `design_requests`
Solicitações ao designer.

Status: `queued → in_progress → done`  
Campos: `format`, `briefing`, `attachments`, `content_card_id`, `deadline`

#### `metric_snapshots`
Snapshots das métricas Meta Ads capturados a cada 15 minutos pelo cron de Defesa Ativa.

Métricas: `spend`, `impressions`, `clicks`, `conversions`, `ctr`, `cpm`, `cpc`, `cpl`

#### `anomaly_alerts`
Alertas de anomalia detectados automaticamente.

Métricas monitoradas: `spend`, `cpl`, `ctr`, `impressions`  
Severidades: `critical`, `high`, `medium`  
Constraint: única por `(client_id, metric, metric_date)` — dedup natural

#### `client_health_scores`
Histórico diário do score de risco de churn por cliente.

Scores: 0-100 (maior = maior risco)  
Níveis: `safe (<40)`, `attention (40-59)`, `high (60-74)`, `critical (>=75)`

#### `team_members`
Membros da equipe. Usados para atribuição e autenticação.

Papéis: `admin`, `manager`, `traffic`, `social`, `designer`

#### `contracts`
Contratos por cliente. Rastreia arquivo, tipo, status de assinatura.

#### `notifications`
Notificações in-app por usuário/papel.

#### `onboarding_checklists`
Itens de checklist de onboarding por cliente.

#### `broadcasts`
Broadcasts enviados (templates de comunicação em massa).

#### `ai_audits`
Cache de auditorias IA geradas por GPT para campanhas.

#### `agency_settings`
Configurações globais da agência (chave/valor). Inclui `meta_token` e `meta_token_expires_at`.

### Histórico de migrações (36 migrações)

| # | Nome | O que faz |
|---|---|---|
| 001 | initial_schema | Schema base: clients, content_cards, tasks, design_requests, team_members |
| 002 | rls_security | Row Level Security para todas as tabelas |
| 003 | additional_tables | Tabelas auxiliares (onboarding, contracts, notifications) |
| 004 | seed_team_members | Dados iniciais da equipe |
| 005 | address/onboarding | Campos de endereço + campos de onboarding |
| 006 | contracts | Tabela de contratos |
| 007 | agency_d4sign | Integração D4Sign (depois removida) |
| 008 | contact_email_required | Email de contato obrigatório |
| 009 | separate_storage_buckets | Buckets separados (onboarding, assets, contracts, arts) |
| 010 | broadcasts | Tabela de broadcasts |
| 011 | ai_audits | Cache de auditorias IA |
| 012 | contract_renewal | Sistema de renovação de contrato |
| 013 | platform_updates | Changelog interno da plataforma |
| 014 | nicho_field | Campo nicho em clients |
| 015 | drop_d4sign_legacy | Remove D4Sign |
| 016-017 | tighten_onboarding_rls | RLS mais restritiva em onboarding |
| 018 | vault_access_log | Log de acesso ao cofre de senhas |
| 019 | ai_cache | Cache de chamadas IA para economizar tokens |
| 020 | tighten_content_design_rls | RLS mais restritiva em content/design |
| 021 | contracts_signed_tracking | Rastreamento de assinatura de contratos |
| 022 | health_scores | Termômetro de churn + histórico de scores |
| 023 | defesa_ativa | Snapshots de métricas + alertas de anomalia |
| 024 | tighten_user_read_updates_rls | RLS de leitura de atualizações |
| 025 | arts_bucket | Bucket para upload de artes |
| 026 | realtime_content_cards | Realtime em content_cards |
| 027 | staff_delete_cards_requests | Staff pode deletar cards/requests próprios |
| 028 | relax_content_design_update | Relaxa RLS de update |
| 029 | design_requests_attachments | Attachments em design requests |
| 030 | design_requests_content_card_id | Link design request → content card |
| 031 | align_team_member_names | Alinha nomes na tabela team_members |
| 032 | budget_monitoring | Módulo de monitoramento de saldos Meta |
| 033 | billing_type_and_daily_spend | Tipo de cobrança + gasto diário em ad_accounts |
| 034 | monthly_budget | Verba mensal em ad_accounts (pós-pago) |
| 035 | designer_sees_all_requests | Designer vê todas as solicitações |
| 036 | current_month_spend | Gasto do mês corrente via Insights |

---

## 6. MÓDULOS FUNCIONAIS DETALHADOS

### 6.1 Módulo de Tráfego Pago (`/traffic`)

**Página principal (`/traffic`):**
- Tabela de investimentos por cliente
- Status de campanhas Meta Ads (consumo da API)
- Kanban de tarefas de tráfego
- Geração de relatório 7 dias em PDF

**Relatório 7 dias:**
- Consome Meta Insights API (campanhas, adsets, ads)
- Métricas: investimento, alcance, impressões, CPM, CTR, CPC, mensagens/leads
- Filtragem de campanhas ativas
- Identificação de "campeão" (melhor CPA)
- Geração de PDF dark-theme com html2canvas + jsPDF
- Export em ZIP de todos os clientes

**Métricas de mensagens — lógica de prioridade:**
O sistema lê os action types na seguinte ordem de prioridade:
1. `onsite_conversion.total_messaging_connection` (Meta novo padrão)
2. `onsite_conversion.messaging_conversation_started_7d`
3. `onsite_conversion.messaging_first_conversation_started`
4. `onsite_conversion.messaging_first_reply`
5. `messaging_conversation_started_7d`
6. `onsite_conversion.whatsapp_business_messaging_conversation_started_7d`
7. `onsite_conversion.engagement`

### 6.2 Módulo de Monitoramento de Saldos (`/traffic/budgets`)

**Funcionalidades:**
- Cards de resumo: total de contas, saldo agregado, contagem por severidade
- Lista de contas com saldo em tempo real
- Código de cores por severidade: crítico (vermelho), atenção (laranja), em revisão (amarelo), ativo/OK (verde), desativada (cinza)
- Sincronização manual via botão + auto-refresh a cada 5 minutos
- WhatsApp link para cobrança com texto pré-preenchido (saldo + chave Pix)
- Configuração de regras de alerta por conta (threshold, severidade, canal)
- Toggle inline pré-pago/pós-pago
- Campo de verba mensal para contas pós-pagas

**Lógica de saldo disponível:**
- Pré-pago com `display_string` na Meta API: usa o valor exato do `funding_source_details.display_string`
- Pré-pago sem `display_string`: usa `balance` bruto da conta
- Pós-pago com `monthly_budget` configurado: `monthly_budget - current_month_spend`
- Pós-pago com `spend_cap`: `spend_cap - amount_spent`
- Pós-pago sem cap/budget: exibe "Cartão de crédito" (sem monitoramento de saldo)

**Auto-detecção de tipo de conta:**
- `funding_source_details.type = 1` → pós-pago (cartão de crédito)
- `funding_source_details.type = 2` → pré-pago (boleto/Pix)
- `funding_source_details.type = 20` → pré-pago (saldo creditado Brasil)
- Pode ser sobrescrito manualmente (billing_type_source = "manual")

**Sincronização batch:**
Usa a Meta Batch API para buscar `balance, amount_spent, spend_cap, currency, account_status, funding_source_details` de até 50 contas por requisição. Simultaneamente busca:
- Gasto diário dos últimos 7 dias via Insights (para calcular média 3d)
- Gasto do mês corrente com `time_range={since: "YYYY-MM-01", until: hoje}` (inclui hoje)

**Engine de alertas:**
- Avalia regras por conta após cada sync
- Respeita intervalo mínimo e máximo de notificações por ciclo
- `cycle_key = act_id|rule_id|YYYY-MM-DD` evita duplicatas
- Saldo acima do threshold limpa o log do ciclo (reset automático)

**Adicionar conta:**
- Botão "+ Adicionar Conta" no header
- Modal lista contas Meta acessíveis pelo token (filtra já vinculadas)
- Busca por nome ou ID
- Seleção de cliente no dropdown
- Ao confirmar: insere em `ad_accounts` + dispara sync imediato
- Também acessível via perfil do cliente: picker de conta no campo "Conta Meta Ads"

### 6.3 Módulo Social Media (`/social`)

**Kanban de conteúdo:**
- 8 colunas de status: Ideias → Script → Produção → Bloqueado → Aprovação Interna → Aprovação Cliente → Agendado → Publicado
- Drag-and-drop entre colunas
- Filtro por gestor de social (Carlos Melo / Mariana Costa / Todos)
- Rastreamento de SLA por coluna (tempo em cada status)
- Timesheet Invisível por card (contagem automática de tempo de trabalho)

**Handoff Social → Designer:**
- Social Media cria Design Request a partir de um card
- Card fica com status "bloqueado" aguardando arte
- Designer entrega pelo modal de briefing
- Social Media confirma recebimento
- Todo o fluxo rastreado com timestamps

**Verificação de publicação:**
- Quando card vai para "Publicado", abre checklist: post no ar + copy correta
- Evita marcar como publicado sem verificar

**Post via envio de arte:**
- Designer pode fazer upload direto da arte no briefing
- Sistema diferencia se o upload é do designer ou do social media

### 6.4 Módulo de Designer (`/design`)

**Fila do designer:**
- Filtros por prioridade, status e cliente
- Design requests ordenadas por prioridade
- Link bidirecional com Content Card (quando veio de social media)
- Attachments de referência
- Upload de arte finalizada → Supabase Storage (bucket `arts`)
- Notificação automática para o social media quando arte é entregue

### 6.5 Módulo de Contratos (`/contratos`)

**Gerador de contratos:**
- Templates DOCX: Tráfego Pago, Social Media, Lone Growth
- Preenchimento automático com dados do cliente (nome, CNPJ, endereço, valor, data)
- Geração via `docxtemplater` + `pizzip`
- Download em `.docx` pronto para assinatura

**Contratos legados:**
- Upload de PDF de contrato existente
- Associado ao cliente no DB

**Tracking de assinatura:**
- Campo `signed_at` quando contrato é assinado
- Alertas automáticos de renovação (migration 012)

### 6.6 Módulo de Defesa Ativa (`/defesa`)

**Funcionamento:**
- Cron a cada 15 minutos: `POST /api/system/defense-scan`
- Para cada cliente com conta Meta: busca insights dos últimos 8 dias
- Salva snapshot em `metric_snapshots`
- Compara com baseline rolling 7 dias via `detectAnomalies()`
- Anomalias detectadas são salvas em `anomaly_alerts`

**Métricas monitoradas:**
- `spend` — gasto diário
- `cpl` — custo por lead
- `ctr` — taxa de cliques
- `impressions` — impressões

**Severidades:**
- `critical` — desvio > 50% da baseline
- `high` — desvio > 30%
- `medium` — desvio > 15%

**Página `/defesa`:**
- Lista alertas não reconhecidos
- Banner de alerta no topo do sistema (`DefesaAlertBanner.tsx`)
- Botão de "Reconhecer" com auth do usuário

### 6.7 Termômetro de Churn (`/churn`)

**Score de risco (0-100, maior = maior risco):**

Sinais e pesos:
- Tarefas atrasadas (overdue_tasks): +10 por tarefa (max 30)
- Onboarding parado há >7 dias: +20
- Contrato vencendo em <30 dias: +25
- Humor negativo nos últimos 7 dias: +15
- Design requests atrasadas: +10 por request (max 20)
- Cliente com status "at_risk": +30

Cron diário (06:00 BRT) calcula todos os clientes, persiste em `client_health_scores`, e dispara notificação se score >= 75 (máximo 1x por semana por cliente).

**Página `/churn`:**
- Lista clientes por risco
- Gráfico de histórico de score
- Breakdown de sinais

### 6.8 Módulo de IA

**Análise de campanhas (`/api/ai/analyze-ads`):**
- Recebe dados de campanhas Meta do frontend
- Envia para GPT com prompt de analista de tráfego
- Cache em `ai_audits` por 24h (evita reprocessamento)
- Resposta: análise textual com recomendações

**Morning Briefing (`/api/ai/morning-briefing`):**
- Executa diariamente
- Agrega: clientes em risco, tarefas atrasadas, alertas de saldo, anomalias Meta
- GPT gera briefing executivo para o admin

**Auditorias periódicas:**
- Análise automática de todas as contas Meta
- Salvas por cliente com data e autor

### 6.9 Módulo de Onboarding de Clientes

**Portal externo:**
- URL pública `/onboarding/[token]` — token único por cliente
- Cliente preenche seus dados sem precisar de login
- Upload de documentos (contrato social, identidade, logo)
- Checklists de tarefas para o cliente completar

**Onboarding interno:**
- Aba "Onboarding" no perfil do cliente
- Checklist de 9 itens pré-configurados por departamento (tráfego, design, social)
- Progresso percentual visível
- Cada check registra quem completou e quando (timeline)

### 6.10 Client Vault (Cofre de Senhas)

- Armazena credenciais de acesso do cliente (Facebook, Google Ads, Instagram, etc.)
- Criptografado com AES-256-GCM usando `VAULT_KEY` do ambiente
- RBAC: staff vê campos mascarados, admin vê completo
- Log de acesso auditável em `vault_access_log`
- Toggle show/hide por campo na UI

### 6.11 Central de Comunicação (`/communications`)

- Chat global (toda a equipe)
- Chat por cliente (thread dedicada)
- Cada mensagem auto-registra entry no histórico/timeline do cliente
- Notificações em tempo real (quando Realtime está ativo)

### 6.12 Dashboard (`/`)

- Métricas do dia: clientes ativos, tarefas pendentes, alertas
- Feed de atividade recente
- Avisos (notices) urgentes
- Alertas de defesa ativa
- Morning Briefing IA
- Feriados próximos

---

## 7. COMPONENTES DE INTERFACE

### Componentes globais

| Componente | Função |
|---|---|
| `AppShell` | Container global com providers de contexto |
| `Sidebar` | Navegação lateral com filtro por papel |
| `Header` | Header com troca de papel (dev), busca global, notificações |
| `LoginScreen` | Tela de login com Supabase Auth |
| `NotificationCenter` | Central de notificações in-app com agrupamento e auto-dismiss |
| `GlobalSearch` | Busca global por clientes, tarefas, cards |
| `KeyboardShortcuts` | Atalhos de teclado (Cmd+K = busca global) |
| `MorningBriefing` | Widget do briefing matinal IA |
| `DefesaAlertBanner` | Banner de alerta de anomalias Meta no topo |
| `SessionTimeout` | Aviso de sessão expirando |
| `ErrorBoundary` | Captura erros de renderização React |
| `OnboardingTour` | Tour guiado para novos usuários |

### Componentes de UI base

| Componente | Função |
|---|---|
| `KanbanBoard` | Kanban genérico drag-and-drop |
| `MetricCard` | Card de métrica com variação |
| `EmptyState` | Estado vazio padronizado |
| `LoadingSpinner` | Spinner de carregamento |
| `DeleteConfirmModal` | Modal de confirmação de deleção |
| `Markdown` | Renderizador de Markdown (react-markdown + remark-gfm) |
| `SmartAlerts` | Alertas contextuais inteligentes |

### Componentes de clientes

| Componente | Função |
|---|---|
| `NewClientModal` | Modal de criação de novo cliente |
| `EditClientModal` | Modal de edição de dados do cliente |
| `Client360Modal` | Visão 360 rápida do cliente |
| `ClientHealthRadar` | Radar gráfico de health score |
| `WhatsAppTemplates` | Templates de mensagem WhatsApp |
| `MeetingScheduler` | Agendador de reuniões |
| `ContractGenerator` | Gerador de contratos DOCX |
| `LegacyContractModal` | Upload de contrato legado |

### Abas do perfil do cliente (components/client-tabs/)

| Componente | Aba |
|---|---|
| `DadosTab` | Dados cadastrais |
| `ResultsTab` | Resultados de campanhas Meta |
| `AIAuditsTab` | Auditorias IA |

### Módulos setoriais (components/sector/)

| Componente | Função |
|---|---|
| `ClientNPS` | Score NPS do cliente |

---

## 8. DEPENDÊNCIAS EXTERNAS E INTEGRAÇÕES

### Meta (Facebook) Ads API

**OAuth flow:**
1. Usuário clica em "Conectar Meta" em `/integrations`
2. Redireciona para OAuth do Facebook com scopes: `ads_read`, `ads_management`, `business_management`
3. Callback troca o code por long-lived token via `/api/meta/exchange-token`
4. Token salvo em `agency_settings` (chave: `meta_token`)
5. Token expira em ~60 dias — sistema detecta expiração e alerta

**Chamadas à API:**
- Versão: Graph API v21.0
- Base: `https://graph.facebook.com/v21.0`
- Retry automático com backoff exponencial (3 tentativas)
- Timeout: 10s para chamadas individuais, 30s para batch

**Endpoints utilizados:**
- `GET /me/adaccounts` — lista contas acessíveis
- `GET /?ids=act_1,act_2&fields=...` — batch de dados de contas
- `POST /` com batch API — insights de múltiplas contas simultaneamente
- `GET /act_XXX/campaigns` — campanhas por conta
- `GET /act_XXX/adsets` — adsets por conta
- `GET /act_XXX/insights` — métricas de performance

### OpenAI (GPT)
- Usado para: análise de campanhas, morning briefing, auditorias
- Cache em `ai_audits` para evitar custos desnecessários
- Respostas em português brasileiro

### Resend (Email)
- Transacional: notificações de renovação de contrato, follow-ups
- Template HTML customizado

### Google Drive
- Link direto para pasta do cliente
- Botão de acesso rápido no perfil
- Não há integração via API (apenas link manual)

---

## 9. SEGURANÇA E CONTROLE DE ACESSO

### Row Level Security (RLS) — Supabase

Todas as tabelas têm RLS habilitada. Políticas principais:

- **`service_role`** (API Routes server-side): acesso total a todas as tabelas
- **`authenticated`**: acesso baseado em papel:
  - Admin/Manager: acesso completo
  - Traffic: acesso a ad_accounts, metric_snapshots, anomaly_alerts
  - Social: acesso a content_cards do seu workspace
  - Designer: acesso a design_requests
- **Dados sensíveis** (CPF, senhas, dados pessoais): somente admin via política específica

### RBAC no Frontend

A função `useRole()` fornece o papel atual. Tabs, botões e campos são ocultados conforme o papel:
- Aba Contratos: somente admin/manager
- Aba Relatórios: somente admin/manager
- Cofre de senhas: admin vê completo, staff vê mascarado
- Dados financeiros agregados (MRR/ARR/LTV): **proibido por decisão do CEO**

### Autenticação

- Supabase Auth (GoTrue) com JWT
- Sessão via cookie `sb-access-token`
- Middleware Next.js valida sessão em cada request
- Aceita também `Authorization: Bearer <token>` para compatibilidade com chamadas server-to-server

### Vault de Senhas

- AES-256-GCM com chave derivada de `VAULT_KEY` (env var)
- Cada senha é encriptada individualmente
- Nunca armazenada em texto plano no DB
- Log de todos os acessos em `vault_access_log`

---

## 10. SISTEMA DE PAPÉIS (ROLES)

| Papel | Descrição | Acesso |
|---|---|---|
| `admin` | CEO / dono da agência | Total — todas as páginas, todos os dados |
| `manager` | Gerente de operações | Quase total — sem algumas análises financeiras |
| `traffic` | Gestor de tráfego pago | /traffic, /clients, perfil completo exceto financeiro |
| `social` | Gestor de social media | /social, /clients, perfil sem contratos/relatórios |
| `designer` | Designer | /design, /clients (leitura), sem dados sensíveis |

Membros reais da equipe:
- Admin: CEO (não especificado)
- Manager: Gerente Ops
- Traffic: Ana Lima, Pedro Alves
- Social: Carlos Melo, Mariana Costa
- Designer: Rafael Designer

---

## 11. SISTEMA DE NOTIFICAÇÕES

**Tipos de notificação:**
- `sla` — prazo de tarefa vencido
- `status` — mudança de status de cliente
- `content` — ação em content card
- `checkin` — check-in do cliente
- `system` — alertas do sistema (anomalias, saúde, etc.)

**Fluxo:**
1. Event ocorre (cron, ação de usuário, anomalia detectada)
2. Função `pushNotification()` salva em `notifications` no DB
3. Frontend lê notificações via polling ou realtime
4. Notificação exibida no `NotificationCenter` com agrupamento
5. Auto-dismiss configurável por tipo

**Realtime:** Desabilitado em produção (container não roda). Frontend usa polling HTTP como fallback.

---

## 12. CRONS E AUTOMAÇÕES

### Crons programados no VPS (via crontab)

| Horário | Endpoint | Função |
|---|---|---|
| 06:00 BRT diário | `/api/system/compute-health` | Calcula Churn Risk Score |
| */15min | `/api/system/defense-scan` | Varre anomalias Meta Ads |
| 07:00 BRT diário | `/api/ai/morning-briefing` | Gera briefing matinal |
| Semanalmente | `/api/system/contract-renewal` | Alerta renovações |
| Diariamente | `/api/system/holiday-alert` | Alerta feriados próximos |
| Mensalmente | `/api/system/cleanup-report` | Limpeza de dados |

### Motor de automações (`/automations`)

Regras configuráveis de SLA:
- "Se tarefa está em `in_progress` há > X dias → notificar responsável"
- "Se cliente não teve post há > 7 dias → alerta de atenção"
- "Se content card está em `blocked` há > 3 dias → escalar"

---

## 13. FLUXO DE DADOS — EXEMPLO COMPLETO

### Criação de novo cliente

1. Usuário abre `NewClientModal` e preenche dados
2. `addClient()` no AppStateContext:
   - Optimistic update: cliente aparece na lista imediatamente
   - `POST /api/clients/create` (ou similar) persiste no DB
   - Auto-cria checklist de onboarding (9 itens)
   - Auto-registra entry "Onboarding iniciado" na timeline
3. Sistema redireciona para `/clients/[id]`
4. Na aba "Visão Geral", usuário vincula conta Meta Ads:
   - Seleciona conta no picker
   - `updateClientData` atualiza `clients.meta_ad_account_id`
   - Simultaneamente `POST /api/traffic/ad-accounts` cria entrada em `ad_accounts`
   - Sync imediato busca saldo da conta na Meta API
   - Conta aparece em `/traffic/budgets`

### Ciclo de conteúdo (Social → Designer → Publicação)

1. Social Media cria Content Card em "Ideias"
2. Arrasta para "Script" → "Produção"
3. Cria Design Request vinculada ao card → card vai para "Bloqueado"
4. Designer vê na fila `/design`, abre briefing, faz upload da arte
5. Card volta para "Aprovação Interna"
6. Social confirma recebimento da arte
7. Aprovação interna → "Aprovação Cliente" → "Agendado" → "Publicado"
8. Na publicação: checklist (post no ar + copy correta)
9. Todo o fluxo rastreado na timeline do cliente

---

## 14. BUGS CONHECIDOS E PROBLEMAS ATIVOS

### Bugs identificados em produção

1. **RAIO-X logs em produção** — `app/api/traffic/sync-balances/route.ts` contém um bloco de logs de diagnóstico marcado como "temporário" que ainda está sendo executado em cada sync. Polui os logs do servidor mas não quebra funcionalidade. Deve ser removido após diagnóstico do saldo.

2. **Realtime WebSocket 502** — O container `supabase-realtime` não está rodando. Qualquer tentativa de conexão WebSocket com o Supabase retorna 502. O frontend gera erros no console mas não quebra a UI (fallback para polling). Documentar explicitamente como comportamento esperado ou reativar o container.

3. **Commit/push bloqueado por hooks** — Durante o desenvolvimento, operações git frequentemente ficam travadas por hooks de pre-commit. Precisa investigar qual hook está causando timeout.

4. **`updateClientData` com campos `undefined`** — Quando `updateClientData` recebe um campo como `undefined`, o DB update pode falhar silenciosamente ou sobrescrever com null. Há um fix que filtra undefined, mas pode haver casos de borda não cobertos.

5. **Social Media — filtro de workspace não persiste** — O filtro de workspace (Carlos Melo / Mariana Costa) reseta ao navegar para outra página e voltar.

6. **Saldo null em pós-pago sem `monthly_budget`** — Contas pós-pagas sem `monthly_budget` configurado e sem `spend_cap` exibem "Cartão de crédito" sem valor. Útil como fallback, mas o usuário não tem visibilidade do quanto já foi gasto no mês.

7. **`current_month_spend` não atualiza em tempo real** — O gasto do mês é calculado via Insights API (que tem delay de ~1h). Pode haver divergência com o valor exato do Gerenciador de Anúncios.

8. **Token Meta expira silenciosamente** — Quando o token de 60 dias expira, todas as sincronizações falham com erro genérico. Não há alerta proativo antes do vencimento.

9. **Rate limit no export ZIP** — Export de relatórios de todos os clientes em ZIP faz múltiplas chamadas à Meta API sequencialmente. Pode atingir rate limit em portfólios grandes (> 20 clientes).

10. **Dados de relatório de 7 dias com fuso horário** — A Meta API retorna dados em UTC. O sistema usa `until=yesterday` mas pode haver diferença de 1 dia para usuários que geram o relatório tarde da noite em BRT.

### Limitações técnicas

- **Sem realtime** — WebSocket desabilitado por limitação de RAM. Dados atualizam por polling ou ação manual.
- **1 vCPU** — Builds Docker podem ser lentos (30-60s). Não há load balancing.
- **Sem CI/CD** — Deploy manual via SSH + scp + docker build.
- **Sem testes automatizados** — Jest/Vitest estão nas devDependencies mas não há test files escritos para as features de produção.
- **Estado misto** — Parte do estado ainda é in-memory React (não persiste no DB), parte já persiste. Inconsistência pode causar divergência após refresh.

---

## 15. OPORTUNIDADES DE MELHORIA — MAPEADAS

### Alta prioridade

1. **CI/CD automatizado** — GitHub Actions para build + deploy automático via SSH ao fazer push na main. Elimina deploy manual.

2. **Alertas proativos de token Meta** — 7 dias antes de o token expirar, gerar notificação para o admin com link de renovação.

3. **Remover logs RAIO-X** — Bloco de console.log de diagnóstico em sync-balances/route.ts deve ser removido de produção.

4. **Reativar Realtime Supabase** — Ou documentar explicitamente que o sistema usa polling. Se memória for o problema, ajustar configuração do container para consumir menos.

5. **Testes de integração** — Coverage mínimo para: sync de saldos, geração de PDF, criação de cliente, handoff designer→social.

6. **Backup automatizado do DB** — Nenhum backup configurado no VPS. Em caso de falha do disco, todos os dados são perdidos.

### Média prioridade

7. **Dashboard de métricas da agência** — Página `/` mostra dados básicos. Poderia ter: taxa de entrega de posts, média de health score dos clientes, comparativo mensal.

8. **Renovação automática de token Meta** — Implementar fluxo de renovação de token antes do vencimento (60 dias → renovar com 7 dias de antecedência via Meta API).

9. **Notificações por WhatsApp** — A engine de alertas de saldo já suporta canal "whatsapp" mas o envio é só log. Integrar com WhatsApp Business API (Z-API, Baileys, ou Meta Cloud API).

10. **Histórico de auditoria do vault** — A tabela `vault_access_log` existe mas não tem interface de visualização. Admin deveria poder ver quem acessou qual senha e quando.

11. **Relatório de performance do designer** — Tempo médio por card, volume de entregas, taxa de retrabalho. Dados já existem no `total_time_spent_ms`.

12. **Onboarding de cliente via link** — O portal `/onboarding/[token]` existe mas pode não estar integrado ao fluxo de criação do cliente (gerar token + enviar link automaticamente).

13. **Export de dados do cliente** — Botão para exportar todos os dados de um cliente (LGPD compliance).

14. **Filtro avançado em `/clients`** — Atualmente filtra por status/atenção. Poderia filtrar por: gestor responsável, vencimento de contrato, health score.

### Baixa prioridade / futuro

15. **App mobile** — PWA básica com notificações push para gestores.

16. **Integração Google Ads** — Sistema só monitora Meta Ads. Clientes com Google Ads não têm monitoramento.

17. **Relatório de Social Media** — Métricas de Instagram/TikTok via API (não Meta). Atualmente relatório é manual.

18. **Kanban com WIP limits** — Limitar quantidade de cards por coluna para evitar gargalos na produção.

19. **Automação de cobrança** — Quando saldo cai abaixo do threshold, gerar automaticamente mensagem WhatsApp de cobrança para o cliente (já tem a chave Pix cadastrada).

20. **Integração D4Sign ou DocuSign** — Para assinatura eletrônica de contratos sem precisar fazer download + upload manual.

---

## 16. CONFIGURAÇÃO DE AMBIENTE

### Variáveis de ambiente (produção — `/opt/loneos/.env`)

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública do Supabase (via Nginx proxy) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service role (API routes server-side) |
| `SUPABASE_INTERNAL_URL` | URL interna Kong para bypass do Nginx (http://supabase-kong-1:8000) |
| `NEXT_PUBLIC_META_APP_ID` | App ID do Facebook Developer |
| `META_APP_SECRET` | App Secret do Facebook Developer |
| `OPENAI_API_KEY` | Chave da API OpenAI para IA |
| `RESEND_API_KEY` | Chave da API Resend para email |
| `EMAIL_FROM` | Email remetente das notificações |
| `VAULT_KEY` | Chave AES-256 para criptografia do cofre (base64 32 bytes) |

### Arquivos importantes no VPS

| Arquivo | Descrição |
|---|---|
| `/opt/loneos/` | Raiz do projeto em produção |
| `/opt/loneos/.env` | Variáveis de ambiente (NÃO comitar) |
| `/opt/loneos/docker-compose.prod.yml` | Compose da aplicação |
| `/opt/loneos/infrastructure/supabase/docker-compose.yml` | Compose do Supabase |
| `/opt/loneos/infrastructure/supabase/migrations/` | Migrações do banco |

---

## 17. HISTÓRICO DE COMMITS RECENTES (50 últimos)

```
a787428 feat: botao Adicionar Conta em /traffic/budgets
37115a3 fix: adiciona onsite_conversion.total_messaging_connection ao countMessages
054dad1 debug: log erro silenciado no UPDATE de ad_accounts no sync
970fd72 fix: monthly spend inclui gasto de hoje (time_range explícito ao invés de date_preset)
ceb40c3 fix: campo verba mensal sempre visivel no modal (independe de is_prepaid)
c54fb92 debug: log RAIO-X de auditoria de saldo no sync (temporário)
54737b2 fix: saldo de contas pós-pagas usa gasto mensal real (Insights) e alertas ativados
552732c fix: rotas API admin para content-cards/tasks/design-requests + rollback correto
892c8cf fix: restaura rotas de delete que foram removidas do git
b3a04b7 fix: corrige 3 bugs no fluxo social→designer
a02b5e0 fix: preview de arte mostra link do Drive quando imagem falha ao carregar
206043f fix: upload de arte no briefing diferencia designer de social media
398c556 fix: updateClientData preserva campos existentes ao receber undefined
05e682c feat: balance display inteligente por tipo em /traffic/budgets
14615c4 fix: postpaid monthly_budget shows contracted value, not billing-cycle delta
f53c666 feat: pós-pago sem verba exibe "Cartão de crédito" + CTA para configurar
67d40c1 feat: verba mensal por conta pós-pago (monthly_budget)
fa7526d fix: usar funding_source_details.display_string como saldo principal
ae47bcb fix: detectAccountType usa SOMENTE funding_source_details (remove heurísticos)
ade01d0 feat: billing type auto-detect + real daily spend + inline toggle
4d28b3e fix: Meta token storage via API route (service role) — fix hash/session collision
c8925fb fix: add exchangeFailed to setState on OAuth callback path
7e1b956 fix: Meta token — ads_management scope, exchangeFailed state, isMetaAuthError helper
95c2077 fix: navegacao travada em sub-rotas /traffic/* (Sidebar handleSecondaryItemClick)
09ee56c feat: sync-balances com toast, log Meta error + last_error_message
637b64c feat: módulo Monitoramento de Saldos Meta Ads
1c09bb0 fix(pdf): page-break avoidance, demographics 30d, evolution chart
514ad96 fix(pdf): ocultar .no-print antes do html2canvas para eliminar página em branco
a916e7f feat(pdf): demographics + weekly evolution no relatório do cliente
eddf94b feat: exportação de relatórios como PDF real via html2canvas + jsPDF
4e881c7 fix: correções de bugs e melhorias em clients, CEO, traffic, social e designer
245e48d fix(zip): fetch sequencial com retry — elimina rate-limit do Meta no export de todos
184ea48 fix(pdf): ZIP usa buildClientReportHtml com gráfico em vez do relatório interno
92b836e chore: restore all project files to git tracking
f2681b4 fix(meta): champion CPA filter rigoroso + blindagem timezone UTC
0a4f0f4 feat(pdf): compact 7d layout + hide inactive campaigns
516901b feat(pdf): redesign dark do relatório de tráfego — estilo Bodyskin
00840f7 feat(traffic): bestAdsetCpa + redesign sóbrio do PDF de relatório
8386b06 fix(meta-api): remove use_account_attribution_setting — causava 400 na API
215f861 feat: deploy.sh com reload PostgREST + isolamento de carteira do Social Media
2ccf7ba feat(contratos): aplica parecer jurídico no template Lone Growth
bdac3fb fix: corrige link DesignRequest→ContentCard — raiz do bastão caindo
```

---

## 18. RESUMO DE ESTADO ATUAL DO SISTEMA

**O que está funcionando bem:**
- Cadastro e gestão completa de clientes
- Kanban de conteúdo com handoff social→designer
- Sincronização de saldos Meta Ads (pré e pós-pago)
- Relatórios 7 dias com PDF em dark theme
- Geração de contratos DOCX
- Defesa Ativa com detecção de anomalias
- Termômetro de churn com histórico
- Morning briefing IA
- Vault de senhas AES-256
- Onboarding checklist com tracking

**O que está parcialmente funcionando:**
- Notificações (funcionam em polling, sem realtime)
- Alertas de saldo (lógica OK, envio WhatsApp ainda é só log)
- Automações (UI existe, backend de execução parcial)
- Export ZIP de relatórios (funciona mas pode dar rate limit)

**O que ainda não foi construído:**
- Envio real de mensagens WhatsApp (apenas log)
- Renovação automática de token Meta
- Backup automatizado
- CI/CD
- Testes automatizados
- Integração Google Ads

---

*Documento gerado automaticamente a partir do código-fonte, migrations e histórico de commits do repositório Lone OS em 11/05/2026.*
