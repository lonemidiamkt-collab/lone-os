# Lone OS

Sistema de gestão operacional interna da Lone Mídia.

**Stack:** Next.js 15 · Supabase · TypeScript · Tailwind CSS · Docker

**Produção:** https://painel.lonemidia.com

---

## Design System

O projeto usa dois sistemas visuais em coexistência:

| Sistema | Localização | Uso |
|---|---|---|
| **Sistema atual** | `components/ui/`, `components/shared/` | Telas existentes |
| **Lone UI v2** | `components/lone-ui/` | Novas telas (Onda UI-1+) |

Documentação completa: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)

Preview de componentes: `http://localhost:3000/dev/tokens`

---

## Desenvolvimento

```bash
npm install
npm run dev
```

## Deploy

```bash
# SSH na VPS
ssh -i ~/.ssh/loneos_vps root@72.60.142.252

# Build e restart
cd /opt/loneos
git pull origin main
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d app
```

## Docs

- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — Design System v2
- [`docs/BRIEFINGS.md`](docs/BRIEFINGS.md) — Banco de Briefings
- [`docs/PDF_GENERATION.md`](docs/PDF_GENERATION.md) — Geração de PDFs
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — Débitos técnicos
