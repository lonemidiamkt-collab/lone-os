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
