# Agente CS (monitor[IA]) — Comportamento Completo

**Lone Mídia · junho/2026.** A escrita de TODO o comportamento do Agente CS — como ele foi
construído até aqui, o que faz em cada situação, e como decide. Documento vivo.

---

## 0. O que é, em uma frase

Um agente de **Customer Success por IA** que **lê os grupos de WhatsApp dos clientes**, identifica
**demandas reais** (pedidos acionáveis), redige um **briefing** e **sugere à equipe** — que confirma
no WhatsApp. Depois, ele **vigia o fluxo de produção** e **cobra, com jeitinho**, quem trava a operação.

Roda no número dedicado **monitor[IA]** (Evolution API), separado do número do gestor de tráfego.

### Princípios que regem TUDO
- **Suggest-only:** o agente **nunca age sozinho** — sempre sugere; o humano confirma.
- **A IA decide O QUÊ, o código decide QUEM:** a IA entende o pedido; o roteamento (qual designer/
  social) é determinístico, via cadastro do cliente.
- **Tom amigável, nunca de auditoria** — fala como um colega de agência, com humor na medida.
- **100% backstage:** o cliente NUNCA vê o agente. Tudo acontece nos bastidores.
- **Na dúvida, silêncio:** prefere não cobrar a cobrar errado. Falso positivo destrói a confiança.
- **À prova de manipulação:** o texto das mensagens é DADO, nunca instrução (anti prompt-injection).

O agente tem **dois papéis**: **(A) Captação de demanda** e **(B) Vigilância de fluxo**.

---

## PARTE A — CAPTAÇÃO DE DEMANDA

Transforma uma mensagem solta no grupo do cliente em um card pronto no Kanban — com revisão humana.

### A.1 — Entrada e filtro (sem IA)
1. Uma mensagem chega no grupo → a Evolution dispara um webhook pro agente (`/api/cs/inbound`).
2. **Segurança:** valida um segredo; se errado, recusa (fail-closed).
3. **Allowlist do piloto:** só processa os grupos liberados (`CS_PILOT_GROUP_JIDS`). O resto, ignora.
4. **Lê o texto** (mensagem normal, resposta/reply, ou legenda de imagem/vídeo).
5. **Descarta ruído:** saudação ("bom dia"), "ok", "kkk", figurinha/emoji solto — não vira nada.
6. **Detecta o autor:** mensagem da EQUIPE da Lone nunca vira demanda (só o cliente gera demanda).
7. **Dedup:** se a mesma mensagem já foi processada (a Evolution às vezes reenvia), ignora.
8. **Debounce (rajada):** se o cliente manda várias mensagens seguidas ("quero uma arte" + "do natal"
   + "pra amanhã"), o agente **junta tudo numa demanda só** (janela de ~90s), em vez de criar três.

### A.2 — Classificação (A1)
Um modelo de IA lê a mensagem e responde, de forma estruturada:
- **É demanda?** (pedido acionável ou só papo?)
- **Tipo:** arte nova, ajuste de arte, cobrança/prazo, feedback de campanha, dúvida, reclamação,
  elogio, agendamento, retração, conversa.
- **Urgência:** baixa / média / alta.
- **Confiança:** 0 a 1.

É calibrado para **captar a mais do que deixar passar** (cobrança, ajuste e reclamação contam como
demanda, mesmo curtos ou em forma de pergunta).

### A.3 — Verificação cética (A2)
Só nos casos **ambíguos** (confiança média), um segundo modelo, **mais forte**, tenta **refutar**:
"isso é MESMO uma demanda, ou é conversa?". Se ele derruba, o agente **não incomoda a equipe**. Isso
corta falso-positivo. (Se esse passo falhar, o fluxo segue normalmente.)

### A.4 — Redação do briefing (A3)
Aqui o agente **entende o pedido de verdade** antes de escrever:
- **Se o pedido está claro:** escreve um briefing acionável, **no tom da marca do cliente**, usando
  só as regras que se aplicam **àquele** pedido (regra de promoção só entra em pedido de promoção).
- **Se o pedido está vago** (ex.: "arte sobre as mudanças da empresa"): **NÃO inventa** — escreve
  curto e **lista o que perguntar ao cliente** (que mudanças? horário? endereço? etc.).
- **Nunca inventa** preço, data ou oferta que o cliente não disse.

### A.5 — Roteamento (quem)
O código decide o responsável a partir do cadastro do cliente:
- arte / ajuste → **designer** (`assigned_designer`)
- feedback de campanha → **tráfego** (`assigned_traffic`)
- resto → **social** (`assigned_social`)

### A.6 — Sugestão no grupo interno
O agente posta no grupo da equipe uma mensagem **curta e humana** (o briefing completo fica guardado
pro card; o WhatsApp recebe só o essencial), por exemplo:

> *Oi Júlio! 👋 A **Império dos Pisos** pediu: **Arte de preço do piso Ultra Lux Black**.*
> *{briefing enxuto} · Post · prazo 3 dias*
> *É só responder **nesta mensagem**: **ok** (crio o card) · **não** (você cuida) · ou **ajustar** e me diz o que mudar 😉*

Se o pedido for vago, o tom muda: *"…mas tá meio vago, antes de produzir confirma com eles: …"*.

### A.7 — Confirmação (responder, sem código)
A equipe **responde (dá reply) na própria mensagem** do agente — **sem código**:
- **ok / pode / fechou** → cria o card.
- **não / deixa, eu cuido** → descarta.
- **ajustar … / "muda a cor pra azul"** → anota e re-posta o briefing ajustado.

**Entende linguagem natural (não só palavra exata):** um interpretador de IA, **na voz da Lone**
(caloroso, com humor), lê a resposta e decide a ação. Se a pessoa já manda a info que faltava
("coloca que a entrega é de 8h às 17h, pode criar"), ele **anexa isso ao briefing E cria o card**,
respondendo algo como *"Fechou, Julio! 🚀 Já tô mandando pro sistema."*

**Anti-alucinação:** se a mensagem parece um **pedido novo** ("cliente pediu outra arte…", "preciso
de…"), o agente **não** trata como resposta — manda pro fluxo de criar uma **demanda nova**. E só
trata como ok/ajustar/descartar quando é **claramente** sobre a demanda pendente.

### A.8 — Organização e memória
- **Fio por demanda (threading):** toda resposta do agente **responde (quota)** a mensagem da
  demanda → cada cliente vira um "fio" no grupo, sem misturar com os outros.
- **Memória do cliente:** quando a equipe informa um **fato durável** (ex.: "entrega 8h-17h, marca
  pelo app deles"), o agente **guarda no cadastro do cliente** e **não pergunta de novo** nas
  próximas artes.

### A.9 — Criação do card (integração com a plataforma)
No "ok", o agente cria um **card real** no Kanban: vinculado ao cliente, com o briefing, prioridade
pela urgência, e o selo **🤖 Agente CS**. O **dono do card é o social do cliente** (aparece no board
dele); o designer vê pelo board de design. O agente **não** manda pro designer sozinho — quem decide
isso é o humano (botão "A fazer" no card).

---

## PARTE B — VIGILÂNCIA DE FLUXO

Depois que o card existe, o agente **vigia o ciclo de produção** e **cobra quem trava**, no grupo
interno, com tom amigável. Roda sozinho **2x ao dia (10h30 e 15h, seg–sex)**.

### B.1 — O que ele vigia (etapas do pipeline)
Segue cada post pelo caminho: **pauta criada → mandou pro designer → designer fez → (ou travou) →
social revisou e agendou no Meta**. As cobranças:
- **Pauta ausente** (em dia firme, **seg/sex**): cliente sem nenhuma pauta pro dia → cobra o social.
  *(Quarta é leve — às vezes não tem post / só vídeo — então não cobra.)*
- **Não foi pro designer:** card parado em "Ideias" sem demanda de design → cobra o social.
- **Designer não pegou:** demanda na fila parada > 4h úteis → cobra o designer.
- **Travado:** card bloqueado → avisa pra destravar.

### B.2 — Lê os sinais REAIS (não só o status do board)
O board costuma ficar **desatualizado** (o card fica em "Ideias" mesmo depois de pronto). Então o
agente olha os **sinais reais**: se o designer **já entregou** (ou a demanda está "concluída"), ele
**nunca cobra o designer** por aquilo. E, como o que vem depois (revisar/agendar) depende do board
estar atualizado, ele **silencia** nesses casos — pra não cobrar trabalho já feito.

### B.3 — Regras de bom-senso (pra não virar spam)
- **Só horário comercial e dia útil** (8h–18h, seg–sex; feriado nacional não cobra).
- **Não-redundância:** no máximo **uma cobrança por situação por dia**.
- **Só cards recentes:** ao vivo, ele cobra só o que foi **criado ontem/hoje** (os antigos são
  histórico, não enche o saco com eles).
- **Tom amigável sempre:** *"Oi Rodrigo! Tem um card do Contele esperando produção. Se precisar de
  referência ou tiver dúvida no briefing, é só falar! 🎨"*
- **Modo seco vs ao vivo:** o que não é cobrança ao vivo fica **só registrado** (pra calibrar sem
  incomodar). As cobranças de "sem pauta" hoje ficam no registro; as de pipeline vão pro grupo.

---

## PARTE C — COPILOTO DO SOCIAL MEDIA (julho/2026)

A Lone deixou de ser só CS e virou parceira de produção do social media:

**Na conversa (grupo interno):**
- **Fala com a equipe** — "Lone, [qualquer coisa]" que não é comando → resposta no tom da casa,
  com DADOS reais do snapshot (pendências, produção, atrasados, esfriando, lacunas, datas).
- **Aprende conversando** — o time ensina ("o Contele prefere gancho curto") → vira regra do
  cliente (`cs_client_rules`) e o briefing auto-enriquece.
- **"Lone, que datas vêm aí?"** — radar de datas comemorativas (30 dias) cruzado com a carteira.
- **"Lone, ideias de post pro [cliente]"** — banco de ideias na hora (briefing + histórico sem
  repetir + datas chegando); reusa o motor da pauta.

**Proativo (crons):**
- **Bom-dia diário** (`cs-bom-dia`, seg-sex 8h BRT) — raio-x do dia: pendências, produção,
  atrasados (só trabalho comprometido; "ideas" é backlog), encalhados, esfriando, **lacuna semanal**
  ("ninguém fica pra trás": cliente de social sem NENHUM post com data na semana) e data
  comemorativa de hoje/amanhã.
- **Radar de datas** (`cs-datas`, seg 8h30 BRT) — datas dos próximos 2-8 dias × nicho da carteira,
  com 1 ideia de post por cliente (gpt-4o-mini); calendário curado em `lib/cs/datas.ts` com datas
  móveis calculadas (Páscoa/Carnaval/Mães/Pais/Black Friday).
- **Pauta semanal** (`cs-pauta`, sex 14h BRT) e **roteiro semanal** (teste) seguem como antes.

**Na plataforma (ContentCardModal):**
- **Legenda (IA) que ENXERGA a arte** — a arte é o assunto nº 1 (fix do caso "arte de telha,
  legenda de tinta"); briefing do cliente entra só pra tom/regras.
- **🎨 Briefing pro designer (IA)** — objetivo, mensagem, texto NA arte (headline/apoio/CTA),
  elementos visuais, o que não pode e especificações por formato; textarea editável; ao
  "Solicitar Design" vai como briefing do pedido.
- **✅ Revisão final do post (IA)** — pre-flight legenda+arte: coerência (o erro nº 1), preço
  inventado, palavra proibida/claim sensível, dado divergente, português; oferece
  "aplicar legenda corrigida" quando o conserto é só texto.

---

## Infra & configuração (resumo técnico)

| Item | Como é |
|---|---|
| Cérebro (IA) | OpenAI — classificação no `gpt-4o-mini`; verificação, briefing e interpretação no `gpt-4o` |
| WhatsApp | Evolution API, número **monitor[IA]** |
| Captação | webhook `/api/cs/inbound` (valida segredo); allowlist por grupo |
| Vigilância | `/api/system/cs-vigilancia` (cron 10h30 e 15h BRT, seg–sex) |
| Memória/dados | tabelas `cs_demandas` (demandas) e `cs_cobrancas` (cobranças) |
| Visão organizada | o **board do Lone OS** — cada demanda vira card do cliente certo |

---

## Estado atual e limitações conhecidas

- **Em piloto, num grupo de TESTE** — fluxo completo já roda ao vivo.
- **O grupo de teste mistura dois papéis** (fonte do cliente + decisão da equipe), o que confunde
  o agente. **Em produção, com grupos separados** (grupo do cliente ≠ grupo interno), isso some.
- A **vigilância do social** (revisar/agendar) só fica 100% quando o time **mover os cards** no board.
- Calibrar o classificador em alguns casos-armadilha ("entregar hoje" ≠ cobrança).
- **Rotacionar a chave da OpenAI** (vazou no chat uma vez) — segurança.
- A fazer: relatório de entregas, lembrar do's&don'ts estruturados, migrar do grupo de teste pros
  clientes reais (terminar os ~40 grupos do monitor[IA] + consentimento LGPD).
