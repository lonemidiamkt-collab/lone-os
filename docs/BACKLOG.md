# Backlog Técnico — Lone OS

Itens de débito técnico confirmados e aceitos. Cada item tem:
- Limitação conhecida
- Proposta de solução
- Critério de priorização (quando vale atacar)

---

## 1. Idempotency persistente para briefings

**Contexto:** `POST /api/clients/[id]/briefing` aceita o header
`Idempotency-Key` para evitar duplo-submit. A implementação atual usa
um `Map` em memória com TTL de 24h (ver `_lib.ts` nas rotas de briefing).

**Limitação conhecida:**
Se o container `loneos-app-1` reiniciar entre duas chamadas com a mesma
`Idempotency-Key`, o cache é perdido e uma segunda versão do briefing
pode ser criada desnecessariamente. O dado não fica corrompido — é só
uma versão extra — mas quebra a semântica de idempotency.

**Proposta de implementação futura:**

```sql
CREATE TABLE idempotency_records (
  key         TEXT        PRIMARY KEY,
  response    JSONB       NOT NULL,
  status_code INT         NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_idempotency_expires ON idempotency_records (expires_at);
-- Job de limpeza: DELETE FROM idempotency_records WHERE expires_at < now();
```

A API consultaria esta tabela antes de processar e gravaria o resultado
após sucesso. TTL de 24h (igual ao Map atual).

**Quando priorizar:**
- Quando aparecer caso real em produção de duplicata de versão causada
  por restart (monitorar via Sentry: `version > 1` criado em < 5s para
  o mesmo `client_id` + `created_by`)
- Ou quando outros endpoints precisarem de idempotency (pagamentos,
  envio de emails em lote)

**Referência no código:** `app/api/clients/[id]/briefing/_lib.ts`

---

## 2. Completude no histórico de versões

**Contexto:** `GET /api/clients/[id]/briefing/history` retorna
`completeness_percent: 0` para todos os itens históricos porque a
função SQL `calculate_briefing_completeness` é chamada via a view
`current_client_briefings`, que só inclui `is_current = true`.

**Limitação conhecida:** A UI de histórico (futura) não vai mostrar %
de completude das versões antigas — vai aparecer sempre 0.

**Proposta:** Chamar a função via RPC por linha, ou mover o cálculo
para a camada TypeScript replicando a lógica da função SQL.

**Quando priorizar:** Quando a UI de histórico for construída e o
design exigir completude por versão.

---

## 3. Migrar autenticação de sessionStorage para JWT em cookie httpOnly

**Contexto:** O mecanismo de autenticação principal do Lone OS usa
`sessionStorage.lone_local_session` para armazenar o ID do perfil do
usuário (`roberto`, `carlos`, etc.) e derivar role/email a partir de
`USER_PROFILES` hardcoded em `RoleContext.tsx`. A verificação de admin
nas rotas de API usa `getServerUser(req)` em `lib/supabase/auth-server.ts`.

**Limitação conhecida:**
- `sessionStorage` é manipulável via DevTools por qualquer pessoa com
  acesso ao browser — um usuário pode trocar o `lone_local_session`
  para `roberto` e obter acesso de admin na UI
- `sessionStorage` não sobrevive ao fechar a aba
- Páginas que precisam de proteção server-side (ex: `/dev/tokens`) não
  conseguem ler `sessionStorage` — precisam de outra fonte de verdade
- Não escala para múltiplos usuários simultâneos com sessões independentes

**Proposta de implementação futura:**
1. Implementar login real via Supabase Auth (email/senha ou magic link)
2. JWT armazenado em cookie `httpOnly; SameSite=Strict` (não acessível
   por JavaScript)
3. `getServerUser(req)` já suporta este fluxo — lê cookie `sb-*-auth-token`
4. Remover `USER_PROFILES` hardcoded e `lone_local_session`
5. Roles/permissões via `user_metadata` ou tabela separada no Supabase

**Quando priorizar:** Alta prioridade quando:
- Sistema tiver mais de 10 usuários simultâneos, **ou**
- Antes de adicionar clientes finais com acesso ao painel, **ou**
- Quando for implementado acesso externo (integrações, API pública)

---

## 4. Refatorar arquitetura do dashboard (app/page.tsx)

**Contexto:** `app/page.tsx` tem 1075 linhas, é um único Client Component
(`"use client"`) com dois sub-componentes (`AdminDashboard`,
`EmployeeDashboard`) e toda a lógica inline.

**Limitação conhecida:**
- Um único arquivo grande dificulta manutenção e onboarding de novos devs
- "use client" no topo força todo o bundle a ser carregado no cliente,
  incluindo partes que poderiam ser Server Components
- Impossível fazer streaming/Suspense por seção enquanto for monolítico

**Proposta de implementação futura:**
1. Extrair `AdminDashboard` e `EmployeeDashboard` para arquivos próprios
   em `app/(dashboard)/`
2. Converter shells externos (header, layout) para Server Components
3. Manter apenas stores Zustand e interações UI como Client Components
4. Usar `React.lazy` / `Suspense` por seção para loading progressivo

**Quando priorizar:** Quando aparecer queixa de lentidão no dashboard,
ou ao próximo onboarding de desenvolvedor na equipe.

**Referência:** `app/page.tsx` — auditado em 2026-05-19, DASHBOARD_AUDIT.md

---

## 5. Implementar fonte de dados real para Ad Rejection e MorningBriefing

**Contexto:** Dois blocos do AdminDashboard usam `mockAdCampaigns`
(dados estáticos em `lib/mockData.ts`):
1. **Ad Rejection Alert** — lista campanhas com `status === "error"`
2. **MorningBriefing** — monta prompt com spend, budget e campanhas por cliente

**Decisão Onda UI-1:** Esses blocos foram **removidos do novo dashboard**
(Fase 1.3) para não exibir dados falsos. Os componentes visuais serão
criados mas não renderizados até que dados reais existam.

**Proposta de implementação futura:**
1. Criar tabela `ad_campaign_snapshots` no Supabase com dados
   importados periodicamente via Meta API (cron ou webhook)
2. Expor via `GET /api/meta/campaigns` com cache de 15 min
3. Substituir `mockAdCampaigns` pelo fetch real nos componentes
4. Reintroduzir Ad Rejection Alert e MorningBriefing no dashboard novo

**Quando priorizar:** Quando o time de tráfego pedir visibilidade de
erros de campanha diretamente no dashboard (hoje consultam no Meta Ads
Manager diretamente).

---

## 6. Auditoria de drift git→produção (recorrente)

**Contexto:** Padrão de incidente recorrente onde arquivos criados no
working directory nunca foram adicionados ao git, causando divergência
silenciosa entre código local e produção.

**Histórico de incidentes:**
- **Abril/2026:** 12 rotas de API ficaram untracked por ~2 meses.
  Produção quebrou silenciosamente (calendário, contratos, AI).
  Só descoberto ao investigar bug de calendário.
- **Maio/2026:** 13 arquivos descobertos via auditoria pré-emptiva
  antes da Fase 1.3. Pegou antes de causar problema.

**Limitação atual:**
Não existe processo automatizado que compare o working directory com
o índice git ou com produção. A detecção depende de checagem manual.

**Proposta de implementação:**
Criar `scripts/audit-drift.mjs` que:
1. Roda `git ls-files --others --exclude-standard` nos diretórios
   relevantes: `app/`, `components/`, `lib/`, `scripts/`, `docs/`
2. Filtra padrões irrelevantes (`.DS_Store`, `node_modules`, etc.)
3. Se encontrar arquivos `??`, gera relatório em
   `docs/AUDIT_REPORTS/YYYY-MM-DD.md` e imprime alerta no terminal
4. (Opcional) Comparar com produção via SSH: `git -C /opt/loneos log --oneline -1`

Adicionar ao `CLAUDE.md`: rodar `node scripts/audit-drift.mjs` ao
final de cada sessão que criar novos arquivos.

**Nota sobre `pasta sem título/`:** Esta pasta ainda aparece como `??`
no git status. O nome contém `í` (UTF-8 `\303\255`) que impede o match
com o `.gitignore`. Para resolver definitivamente, usar o nome exato
que o git reporta na entrada do `.gitignore`, ou mover/deletar a pasta
manualmente.

**Quando priorizar:** Alta prioridade. Próximo incidente pode quebrar
features críticas em produção sem nenhum erro visível.

---

## 7. Investigar supabase-studio-1 unhealthy

**Contexto:** Container `supabase-studio-1` aparece como `(unhealthy)` no
`docker ps` há pelo menos semanas (observado em 2026-05-19). É a UI de
administração do Supabase self-hosted.

**Impacto:** Nenhum no app em produção. O `loneos-app-1` e
`supabase-db-1` (healthy) não dependem do studio. Acesso ao banco
continua via `supabase-kong-1` e `supabase-rest-1`.

**Quando priorizar:** Baixa. Investigar quando houver necessidade de usar
a UI do Supabase diretamente no VPS (ex: query rápida sem SSH).

**Referência:** VPS `/opt/backups/postgres/` — backups em `/opt/backups/postgres/`,
não em `/opt/loneos/backups/` (path corrigido em 2026-05-19).

---

## INCIDENTES

### INCIDENTE #4 — Git drift (4ª ocorrência)

**Data:** 26/05/2026

**Causa:** Durante sessão de BFF refactor, Claude Code (sessão anterior)
corrigiu erro de build editando `app/page.tsx` diretamente na VPS e
commitando lá (`8546e5f`), em vez de seguir fluxo local → push → pull.
Gerou commit órfão na VPS que não existia no origin. Uma posterior
`git pull` na VPS criou merge commit automático `842ab3c`, agravando
a divergência.

**Detecção:** Auditoria pós-correção de segurança (remoção senha-mestra)
identificou divergência entre VPS e origin ao preparar deploy.

**Resolução:**
- `8546e5f` trazido para origin via patch + cherry-pick (commit `3f78717`)
- `842ab3c` (merge automático sem conteúdo próprio) descartado com
  `git reset --hard origin/main` na VPS
- Pre-commit hook anti-deleção instalado: local, VPS e versionado em
  `scripts/git-hooks/pre-commit`
- Histórico de drift agora completo: 4 ocorrências documentadas

**Lições:**
- NUNCA editar arquivo diretamente na VPS
- Toda correção: local → commit → push → pull na VPS
- Hook bloqueia DELEÇÃO mas não impede commits feitos diretamente na VPS
- Vigilância de processo continua necessária

---

### INCIDENTE #5 — Senha-mestra exposta no bundle JS

**Data:** 25–26/05/2026

**Causa:** `lib/context/RoleContext.tsx` tinha 6 senhas individuais e
1 senha-mestra (`882289`) hardcoded em texto puro, compiladas no bundle
JS e visíveis na aba Sources/Network do DevTools do browser.

**Detecção:** Membro da equipe identificou senhas na aba Network do DevTools.

**Resolução:**
- 6 usuários criados no Supabase Auth com senhas temporárias
- Fallback hardcoded removido de `RoleContext.tsx`
- Sessão por `sessionStorage` removida
- Senhas antigas queimadas (todos forçados a trocar no próximo login)
- Autenticação agora 100% via Supabase Auth

**Lições:**
- Nunca hardcodar credenciais em código que vai para o bundle client-side
- Toda autenticação deve passar por sistema dedicado (Supabase Auth)
- Validar bundle JS regularmente por padrões de credenciais (`grep -r "password\|senha\|secret"` nos arquivos compilados)

---

### DÉBITO TÉCNICO PREVENTIVO — Storage cleanup de attachments

**Contexto:** `ON DELETE CASCADE` em `card_attachments` apaga as linhas no banco quando
o card é deletado, mas **NÃO remove os arquivos físicos do bucket Supabase Storage**.
Arquivos órfãos podem acumular silenciosamente no bucket `"arts"`.

**Mitigação obrigatória na Fase 2 (backend — onda kanban-multi-art):**
- Endpoint de deletar card deve listar attachments e remover do Storage **antes** de deletar o card no banco
- Endpoint de deletar attachment individual deve remover do Storage **antes** de deletar a linha
- Em caso de falha no Storage, a transação SQL é revertida (não deleta no banco se não conseguiu deletar no Storage)

**Mitigação futura (onda própria):**
- Script periódico (cron mensal) que lista arquivos no bucket `arts/` e compara com
  `card_attachments.path` + `content_cards.image_url`
- Arquivos sem referência são candidatos à remoção (com confirmação humana — não automático)

**Prioridade:** Média. Implementar quando houver primeiro sintoma (bucket inchado, custo de storage subindo).
