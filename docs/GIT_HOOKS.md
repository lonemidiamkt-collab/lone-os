# Git Hooks — Lone OS

## pre-commit: anti-deleção

Bloqueia commits que deletem arquivos de código críticos.

### Por quê existe

O projeto sofreu **4 incidentes de git drift** onde arquivos foram deletados acidentalmente ou commits foram feitos diretamente na VPS, quebrando a sincronização com o origin. Ver histórico completo em `docs/BACKLOG.md` (seção INCIDENTES).

O hook não previne todos os tipos de drift, mas bloqueia a causa mais comum: deleção acidental de arquivos de código durante merges, rebases ou refactors descuidados.

### O que é protegido

**Diretórios:**
- `app/` — rotas Next.js e API routes
- `lib/` — lógica de negócio, queries, types
- `components/` — componentes React
- `stores/` — stores Zustand
- `scripts/` — scripts de automação
- `infrastructure/` — configuração de infra
- `hooks/` — React hooks customizados
- `contexts/` — React contexts

**Arquivos raiz:**
- `package.json`, `tsconfig.json`, `Dockerfile`
- `next.config.*`, `tailwind.config.*`, `middleware.ts`

### Como burlar (quando a deleção é intencional)

```bash
git commit --no-verify
```

Usar apenas quando a deleção for deliberada e revisada. Documentar no commit message o motivo.

### Como instalar em nova máquina

```bash
# Após clonar o repositório:
bash scripts/git-hooks/install.sh
```

Ou manualmente:

```bash
cp scripts/git-hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### Localização dos arquivos

| Arquivo | Descrição |
|---|---|
| `scripts/git-hooks/pre-commit` | Fonte versionada do hook |
| `scripts/git-hooks/install.sh` | Script de instalação |
| `.git/hooks/pre-commit` | Hook ativo (não versionado, instalado pelo script) |
