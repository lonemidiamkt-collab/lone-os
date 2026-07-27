# Arquitetura do Agente CS (Loninho) — mapa para auditoria

> Levantado do código em 27/07/2026. Serve pra você conferir, um a um, o que existe, o que está
> no ar e o que precisa ser criado ou melhorado.
>
> **O Loninho não é um agente. São ~25 capacidades** penduradas numa instância de WhatsApp. Este
> documento separa o que é **gatilho**, **capacidade** e **saída** — porque cada um quebra de um
> jeito diferente.

---

## 1. O que é o Loninho, tecnicamente

| | |
|---|---|
| Número | `5522 98823-7830` |
| Instância (Evolution) | `monitor[IA]` |
| Nome que o cliente vê | **Lone Mídia** |
| Grupos | **43 de 43** clientes + grupo interno da equipe |
| Cérebro | OpenAI — `gpt-4o-mini` na maioria, `gpt-4o` onde erro custa caro |
| Entra por | webhook `/api/cs/inbound` (mensagem chega) e ~20 crons (hora marcada) |
| Sai por | `csSendGroupText` / `csSendGroupDocument` / `csSendGroupImage` |

Existe um **segundo número** na operação: o do gestor (`Julio_gestor`), que hoje manda só o
relatório de segunda. É proposital — redundância. Em 27/07 o número do gestor caiu e o Loninho
seguiu trabalhando.

---

## 2. As três formas de acionar

### A. Alguém fala no WhatsApp → `/api/cs/inbound`
O agente lê **toda** mensagem dos grupos e decide o que fazer. É o caminho mais complexo e o que
mais precisa de auditoria.

### B. Hora marcada (cron)
~20 rotinas em horário fixo. Não dependem de ninguém pedir.

### C. Alguém clica no painel
Geração de calendário, roteiro, briefing e revisão sob demanda.

---

## 3. CAPACIDADES — o inventário

Coluna **Decide**: `IA` = modelo de linguagem decide · `Regra` = código determinístico.
Coluna **Gate**: quem confirma antes de virar ação/mensagem.

### 3.1 Entender o que chegou

| # | Capacidade | Arquivo | Decide | Gate | Status |
|---|---|---|---|---|---|
| 1 | **Classificar mensagem** — é demanda? de quem? que tipo? | `lib/cs/classifier.ts` | IA (mini) | — | no ar |
| 2 | **Conferir a classificação** (2ª opinião antes de agir) | `lib/cs/verifier.ts` | IA | — | no ar |
| 3 | **Interpretar ok/não** do time nas sugestões | `lib/cs/interpreter.ts` | IA | — | no ar |
| 4 | **Ler imagem** (print, panfleto, arte de concorrente) | `lib/cs/vision.ts` | IA (visão) | — | no ar |
| 5 | **Transcrever áudio** (nota de voz) | `lib/cs/transcribe.ts` | Whisper | — | no ar |
| 6 | **Sentimento** do cliente na conversa | `lib/cs/sentimento.ts` | IA | — | no ar |
| 7 | **Detectar ausência/férias** | `lib/cs/ausencia.ts` | IA | — | no ar |
| 8 | **Cliente falou da arte?** (aprovou / pediu ajuste / não falou) | `lib/cs/leu-a-arte.ts` | IA | — | **novo (27/07)** |

### 3.2 Conversar

| # | Capacidade | Arquivo | Decide | Gate | Status |
|---|---|---|---|---|---|
| 9 | **Responder o time** com dados reais | `lib/cs/conversa.ts` + `snapshot.ts` | IA + Regra | — | no ar |
| 10 | **Rascunhar resposta ao cliente** | `lib/cs/resposta.ts` | IA | **humano envia** | no ar |
| 11 | **Mensagem de suporte ao cliente** (qua/sex) | `lib/cs/mensagem-cliente.ts` | IA + Regra | **modo revisão** | revisão |
| 12 | **Tom da casa** (estilo aprendido e revisado) | `lib/cs/estilo.ts` | Regra | — | no ar |
| 13 | **Não repetir "bom dia"** no mesmo grupo | `lib/cs/ja-falamos.ts` | Regra | — | **novo (27/07)** |

### 3.3 Produzir

| # | Capacidade | Arquivo | Decide | Gate | Status |
|---|---|---|---|---|---|
| 14 | **Legenda de post** | `lib/cs/legenda.ts` + `guia-legendas.ts` | IA | humano | no ar |
| 15 | **Pauta da semana** | `lib/cs/pauta.ts` | IA | ok/não | no ar |
| 16 | **Briefing pro designer** | `lib/cs/briefing-design.ts` | IA | humano | no ar |
| 17 | **Roteiro de vídeo** (método Roberto) + PDF | `lib/cs/criativo.ts`, `roteiro-pdf.ts` | IA | humano | no ar |
| 18 | **Calendário de conteúdo** (mês/semana) + PDF | `lib/cs/motor.ts`, `calendario-pdf.ts` | IA | humano | **usado 7× na vida** |
| 19 | **Enriquecer briefing** do cliente | `lib/cs/enriquecer-briefing.ts` | IA | — | no ar |
| 20 | **Ideias por data comemorativa** | `lib/cs/datas.ts` + cron | IA | ok/não | no ar |
| 21 | **Preparar/resumir reunião** | `lib/cs/reuniao.ts` | IA | humano | pouco uso |

### 3.4 Conferir qualidade

| # | Capacidade | Arquivo | Decide | Gate | Status |
|---|---|---|---|---|---|
| 22 | **Revisar a arte entregue** contra o briefing | `lib/cs/revisao-arte.ts` | IA (**gpt-4o**) | avisa, não bloqueia | no ar |
| 23 | **Revisar o post antes de publicar** | `lib/cs/revisao-post.ts` | IA (**gpt-4o**) | avisa | no ar |
| 24 | **Autoavaliação** (acerto/falso-positivo do próprio agente) | `lib/cs/autoavaliacao.ts` | Regra | — | no ar |

### 3.5 Cobrar e vigiar

| # | Capacidade | Arquivo | Decide | Gate | Status |
|---|---|---|---|---|---|
| 25 | **Vigilância** — card parado, prazo vencido | `lib/cs/vigilancia.ts` | Regra | — | no ar (15/15min) |
| 26 | **Cobrança de pendência** | `lib/cs/cobranca.ts` | IA (**gpt-4o**) | — | no ar |
| 27 | **Setup dos 7 dias** do cliente novo | `lib/cs/setup-7dias.ts` | Regra | — | **novo (27/07)** |
| 28 | **Conferir entrega** (quem não recebeu) | `lib/cs/entregas.ts` | Regra | — | **novo (26/07)** |
| 29 | **Saúde da conexão do WhatsApp** | `lib/whatsapp/saude.ts` | Regra | — | **novo (27/07)** |

### 3.6 Registrar

| # | Capacidade | Arquivo | Status |
|---|---|---|---|
| 30 | **Criar card a partir da demanda** | `lib/cs/card.ts` | no ar — **sempre com ok humano** |
| 31 | **Aprender regra do cliente** | `cs_client_rules` | no ar |
| 32 | **Corpus de conversa** (3.724 msgs) | `cs_message_corpus` | no ar |
| 33 | **Registro de saída** (o que o agente mandou) | `cs_outbound` | **novo (27/07)** |

---

## 4. As rotinas por horário

| Horário | Rotina | Para quem |
|---|---|---|
| 6h | Sincroniza Instagram | interno |
| 6h30 | Recalcula posts do mês | interno |
| 7h50 | **Confere conexão do WhatsApp** | interno |
| 8h | Bom dia · relatório de segunda (Julio) | equipe · cliente |
| 8h30 | Postagem do dia | equipe |
| 9h | Pendências · tarefas · setup dos 7 dias | equipe |
| 9h–17h (15/15min) | Vigilância de card parado | equipe |
| 12h | Eventos dos clientes | equipe |
| 14h (seg) | Saúde dos clientes | equipe |
| 16h (dom/ter/qui) | Véspera de postagem | equipe |
| 17h (sex) | Pauta da semana seguinte | equipe |
| 19h/20h (sex) | Raio-x · relatório do time | equipe |
| Dia 20 | Calendário do mês + pergunta da promoção | cliente |
| Dia 1º | Relatório mensal | cliente |

---

## 5. O que auditar (minha leitura do que está fraco)

### Sem gate humano e falando com cliente
Hoje **nenhuma** capacidade fala com o cliente sem gate — o suporte está em modo revisão e a
resposta é rascunho. **Manter assim** até validar.

### Construído e quase não usado
| O quê | Uso real |
|---|---|
| Calendário de conteúdo (#18) | **7 vezes na vida**; `content_period_plans` tem 0 linhas |
| Preparar reunião (#21) | quase nada |
| Check-in com cliente | tabela **zerada** |
| Jornada / NPS | tabelas **zeradas** |

### Sem dono claro
A **vigilância** (#25) e a **cobrança** (#26) mandam no grupo da equipe sem saber uma da outra —
é o mesmo problema do "bom dia" duplicado, agora resolvido só do lado do cliente.

### Custo
Quatro capacidades usam **gpt-4o** (10× mais caro): revisão de arte, revisão de post, cobrança e
o motor de calendário. As duas revisões justificam — erro de preço chega ao cliente. **A cobrança
provavelmente não justifica**: é texto interno, `mini` daria conta.

---

## 6. O que eu recomendo verificar primeiro

1. **Capacidade #22 (revisar arte)** — é a que mais evita prejuízo. Vale conferir se está pegando
   os erros de preço de verdade.
2. **Capacidade #18 (calendário)** — a melhor ferramenta, praticamente sem uso. Ou entra na
   rotina, ou é esforço parado.
3. **Capacidade #26 (cobrança)** — trocar `gpt-4o` por `mini` corta custo sem perder qualidade.
4. **#9 (conversa com o time)** — é a porta de entrada; se ela responde mal, o time desiste do
   agente inteiro.

---

*Mantido junto com `docs/PLAYBOOK_SOCIAL.md`. Mudou capacidade do agente? Atualiza aqui.*
