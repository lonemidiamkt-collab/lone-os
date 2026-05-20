# Lone OS — Project Context

## VPS Production Server
- **Provider**: Hostinger KVM 1
- **IP**: 72.60.142.252
- **User**: root
- **SSH Command**: `ssh -i ~/.ssh/loneos_vps root@72.60.142.252`
- **SSH Key**: ~/.ssh/loneos_vps (ed25519, email: lonemidiamkt@gmail.com)
- **Specs**: 1 vCPU, 4GB RAM, 50GB NVMe

## Domain
- **URL**: https://painel.lonemidia.com
- **DNS**: Cloudflare (proxied)
- **SSL**: Cloudflare (proxy mode — handles HTTPS automatically)

## Deploy Stack
- Docker + Docker Compose
- Next.js standalone + PostgreSQL 16
- Nginx reverse proxy (port 80 → 3000)
- SSL via Cloudflare proxy
- **Compose file:** `/opt/loneos/docker-compose.prod.yml` (versionado em git)
- **Script oficial:** `bash scripts/deploy.sh` (executa na VPS via SSH)

## Regras CRÍTICAS de Deploy na VPS

### Comando correto de deploy (OBRIGATÓRIO)
```bash
ssh -i ~/.ssh/loneos_vps root@72.60.142.252 "cd /opt/loneos && bash scripts/deploy.sh"
```
Ou direto:
```bash
ssh -i ~/.ssh/loneos_vps root@72.60.142.252 \
  "cd /opt/loneos && git pull origin main && \
   docker compose -f docker-compose.prod.yml --env-file .env build app && \
   docker compose -f docker-compose.prod.yml up -d app"
```

**O `--env-file .env` é OBRIGATÓRIO no build.** As variáveis `NEXT_PUBLIC_*` são
baked no bundle JavaScript em build time. Sem esse flag, o Dockerfile usa defaults
`http://127.0.0.1:8000` e `"placeholder"`, o que quebra TODAS as requisições ao
Supabase silenciosamente — a app abre mas não carrega nenhum dado.

### Proibidos absolutos na VPS (NUNCA fazer)
1. **NUNCA `git reset --hard` na VPS** — remove arquivos não versionados como
   backups locais, configs, e pode apagar o `docker-compose.prod.yml` se não
   estiver em git. Usar apenas `git pull origin main`.
2. **NUNCA `docker compose build` sem `--env-file .env`** — bake variáveis erradas.
3. **NUNCA recriar `docker-compose.prod.yml` de memória** — sempre usar o do git
   (`git show HEAD:docker-compose.prod.yml`) ou o `scp` da máquina local.
4. **NUNCA executar comandos destrutivos em `/opt/loneos` sem backup** — o `.env`
   NÃO está em git e contém todos os segredos de produção.

### Arquivos críticos na VPS (não estão em git)
| Arquivo | Por que crítico | O que fazer se sumir |
|---|---|---|
| `/opt/loneos/.env` | Todos os segredos de produção | Restaurar do backup seguro do Roberto |
| `/opt/loneos/.env.local` | Anon key local para dev | Recriar do .env.local da máquina dev |

### Incidente de referência (2026-05-20)
`git reset --hard origin/main` apagou `docker-compose.prod.yml` (não estava em git).
Ao recriar, o `--env-file .env` foi omitido. O build usou defaults localhost.
Todos os dados sumiam do frontend, sem erro visível. Levou ~2h para diagnosticar.
**Correção:** `docker-compose.prod.yml` agora está em git + `scripts/deploy.sh` documenta
o fluxo correto.

## Brand
- **Company**: Lone Midia
- **Primary Color (LM Blue)**: #0d4af5
- **No financial data in system** (no MRR/ARR/LTV by CEO request)

## Regras obrigatórias de Git

### Arquivos não rastreados (CRÍTICO)
Antes de qualquer deploy ou ao final de qualquer tarefa que crie arquivos novos,
rodar OBRIGATORIAMENTE:

```bash
git ls-files --others --exclude-standard app/ lib/ components/ docs/
```

Se houver arquivos `??` relevantes (rotas de API, componentes, libs, docs):
1. Adicionar ao staging: `git add <arquivo>`
2. Commitar junto com a tarefa
3. NUNCA deixar arquivo novo fora do git

**Por que:** arquivos criados pelo Write tool vão ao disco imediatamente mas não
entram no git automaticamente. Sem `git add`, não chegam ao VPS no deploy.
Causa: features funcionam localmente mas quebram silenciosamente em produção.
Incidente: 12 rotas de API (holidays, contracts, AI, etc.) ficaram fora do git
desde abril/2026, quebrando o calendário e outros recursos sem erro visível.

### Fluxo padrão ao criar arquivos novos
1. Criar arquivo com Write tool
2. `git add <arquivo>` imediatamente
3. Commitar na mesma tarefa ou na próxima
4. Nunca acumular `??` entre sessões

## Regras para salvar documentos/seeds

Quando o usuário mandar conteúdo para salvar (briefing, seed data, documento):

1. **Salvar primeiro, perguntar depois** — salvar o arquivo exatamente como
   recebido, sem reformatação
2. **Caminho padrão para seeds:** `docs/seeds/<nome>-<YYYY-MM>.md`
3. **Branch dedicada:** `feature/<nome>-seed-data`
4. **Commit imediato** antes de qualquer outra ação
5. **Push só após OK** do usuário
6. **Auditoria antes de importar:** contar clientes, verificar match com banco,
   listar ausências — NÃO importar nada sem auditoria aprovada

### Protocolo específico para briefings
Quando receber conteúdo de briefing de clientes:
- Salvar em `docs/seeds/briefings-clientes-<YYYY-MM>.md`
- Fazer auditoria completa (itens a-f abaixo) antes de qualquer importação:
  a) Quantos clientes estão no documento? Listar nomes
  b) Match case-insensitive (ignorar acentos) com clientes no banco
  c) Clientes do documento que NÃO existem no banco
  d) Clientes do banco que NÃO estão no documento
  e) Estrutura consistente entre clientes? (mesmas seções ou varia)
  f) Quantas seções/campos cada cliente tem preenchidos
- NÃO importar nada para o banco sem aprovação explícita após auditoria
