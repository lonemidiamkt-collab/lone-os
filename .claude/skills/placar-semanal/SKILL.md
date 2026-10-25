---
name: placar-semanal
description: Como a Lone fala de resultado de anúncio com o dono do negócio, no jeito de cada nicho. Use SEMPRE que for escrever, revisar ou mudar o texto que vai com o relatório de segunda (o "placar da semana"), qualquer mensagem de resultado de tráfego para cliente, as dicas por nicho, a regra que tira o produto do nome do anúncio, ou quando alguém perguntar "como falar com o dono de [loja de tinta / clínica / ótica…]". Também para incluir um nicho novo ou ajustar a voz de um que já existe.
---

# Placar da semana — falar de resultado no jeito de cada nicho

Toda segunda, às 8h, cada cliente com contrato de tráfego recebe no grupo dele o PDF dos últimos
7 dias (`client-messages?kind=monday`). Desde 24/10/2026 a legenda desse PDF é o **placar da
semana**: o resultado em número, os dois anúncios que mais trouxeram conversa (pelo produto, com
medida), uma dica do nicho e uma pergunta que faz o dono responder com o número dele.

**Por quê (Roberto, 24/10/2026):** a legenda era uma frase de bênção sorteada entre cinco, igual
para a loja de tinta e para a clínica de estética. O dono lê o WhatsApp no intervalo do balcão e não
abre o PDF. O texto é o relatório que ele de fato lê.

A base de tudo é o **Playbook Lone Construção** (Claude Docs,
https://claude.ai/artifact/CRijErDknxkzfVp486SMRC), seções "Quem é o dono de loja", "Como o time
conversa com ele", "Tráfego pago" e "Ritual da conta". Para os outros 17 nichos, **`nichos.md`** nesta
pasta (pesquisa de 24/10/2026, com fontes abertas e lidas): o que o dono mede, a palavra honesta para
o resultado, glossário com medidas, pergunta de fechamento, 6 dicas e **o que a lei e o conselho não
deixam dizer** — leia a seção do nicho antes de escrever para um cliente dele.

## Regras do setor (o que não se escreve)

Resumo da "Lista vermelha" de `nichos.md` — vale para o placar, para mensagem ao cliente e para
revisar anúncio:

| Nicho | Não escrever | Por quê |
|---|---|---|
| todos | agendamento, orçamento, pedido, venda, paciente, lead (como resultado do anúncio) | o anúncio só mede conversa |
| estética | Botox®, Dysport®, preço por unidade de toxina; "resultado garantido", "sem dor" | Lei 9.294/96, art. 7º; CFM 2.336 |
| farmácia de manipulação | fórmula com nome ou preço ("Mounjaro manipulado") | RDC 67/2007, item 5.14 |
| veterinária e pet shop | preço de castração/cirurgia, "grátis", promoção; pet shop sem veterinário anunciando castração ou vacina | CFMV 1.649/2025; Lei 5.517, art. 5º |
| ótica | exame de vista "grátis" amarrado à compra; "consulta" para optometrista | Decreto 24.492/34; CDC, art. 39, I |
| suplementos | termogênico, queima gordura, hipertrofia | Anvisa (RDC 243, IN 28) |
| solar | zerar a conta, conta zero, payback garantido | Lei 14.300; CDC, art. 37 |
| carros, móveis, solar | aprovação garantida, sem consulta ao SPC | CDC, art. 54-C |
| bazar | TV box com canais liberados, IPTV | Anatel, Ato 9.281/2023 |
| comércio | preço não confirmado; "não aceitamos devolução" em venda pelo WhatsApp | CDC, arts. 30, 35 e 49 |

No código (`citacaoDoAnuncio`): Botox/Dysport viram "toxina botulínica", "grátis" sai do nome
citado, e na farmácia de manipulação nenhum produto é citado (só a frase do anúncio). Em clínica,
consultório, veterinária, ótica e farmácia, **nunca** nome, foto ou print de quem chamou (dado de saúde
é sensível — LGPD, art. 5º, II).

## A mensagem (até 5 linhas)

```
Bom dia! Relatório da semana (19/10 a 25/10) aqui em cima.
*Placar:* 38 conversas no WhatsApp vindas do anúncio, R$ 4,20 em média por conversa — 12% a mais que na semana anterior.
*O que mais puxou conversa:* telha fibrocimento 2,44×1,10 (14 conversas) e cimento CP3 (9).
*Dica:* Responder a conversa com 4 perguntas — o que vai fazer, quantidade, bairro e se retira ou recebe — fecha mais rápido que mandar só o preço.
E aí na loja, a semana vendeu mais ou menos que a anterior?
```

Clínica de estética, com campanha de cadastro:

```
*Placar:* 22 pessoas deixaram o contato pelo anúncio, R$ 9,10 em média por contato — no mesmo ritmo da semana anterior.
*O que mais trouxe contato:* depilação a laser virilha (9 contatos) e preenchimento labial (5).
*Dica:* Oferecer dois horários na primeira resposta ("quinta 10h ou sábado 9h?") marca mais avaliação que perguntar "quando você pode?".
E aí, a agenda da semana encheu mais ou menos que a anterior?
```

## As regras (do playbook — valem para qualquer mensagem de resultado ao dono)

1. **Número primeiro, próximo passo no fim**, com dono e data.
2. **Uma mensagem, um assunto, até 5 linhas.**
3. **Produto pelo nome e pela medida** ("o 70×70 acetinado", "a lata de 18 L"), nunca "o produto" e
   nunca o nome do anúncio ("ADS - ESTATICO - ...").
4. **Notícia ruim no mesmo dia, com causa e o que já foi feito** — e escrita por gente, não pelo robô.
5. **Nunca prometer** resultado, estoque, prazo ou preço que ele não confirmou. Preço que está no
   nome do anúncio **nunca** vai para a mensagem: pode estar vencido.
6. **Nunca citar outro cliente.** Comparação só agregada e anônima.
7. **Zero jargão**: nada de CTR, CPM, alcance, engajamento, "lead". O resultado tem nome de gente:
   "conversas no WhatsApp", "pessoas deixaram o contato", "compras".
8. **Responder no mesmo turno** em dia útil.

E a regra do sistema: **só o contrato autoriza falar de anúncio** (`podeFalarDeAnuncio`, de
`lib/clients/servico.ts`). Cliente só de social nunca recebe placar.

## Onde está no código

| Peça | Arquivo |
|---|---|
| Montar o texto, tirar o produto do nome, escolher o segmento | `lib/traffic/placar-semanal.ts` |
| Pergunta e dicas de cada segmento | `lib/traffic/placar-voz.ts` |
| Envio de segunda (legenda do PDF, alertas, modo revisão) | `app/api/system/client-messages/route.ts` |
| Prévia sem envio | `app/api/system/weekly-reports/route.ts` (`?placar=1`) |
| Testes (com nomes reais de anúncio) | `tests/placar-semanal.test.ts` |

**Os números são os do PDF.** `buildClientPdf` devolve o `RelatorioAnuncios` que montou o PDF e o
placar sai dele: mesma janela (7 dias até ontem), mesmo custo (investimento total ÷ resultados),
mesmos anúncios (`topCriativos`). Nunca recalcule à parte.

## Produto pelo nome e pela medida

`produtoDoAnuncio(nome, segmento)` lê o nome que o gestor deu ao anúncio:

| Nome do anúncio | Vira |
|---|---|
| `ADS - ESTATICO - TELHA FIBROCIMENTO 2,44 X 1,10 - R$ 59:00` | telha fibrocimento 2,44×1,10 |
| `ADS - CIMENTO CP3 -  32 - 16/10` | cimento CP3 |
| `ADS - ESTATICO - DECORA MATTE 18L` | decora matte 18 L |
| `ADS - VIDEO - CHEGOU A HORA DE VOCE REFORMAR` | o vídeo "Chegou a hora de você reformar" |
| `ADS - VÍDEO - JEEP COMPASS` (revenda de carros) | Jeep Compass |
| `ADS - VIDEO - SE VOCE É DE` / `Novo anúncio de Tráfego` | não é citado |

- Sai sempre: `ADS`, formato (estático, vídeo, imagem, motion), preço, data, `— Cópia`, `[TAG]`, número
  solto de variação, versão (`V3`).
- É produto quando tem palavra de produto (lista `PRODUTOS`) ou uma medida (`18 L`, `70×70`, `4 mm`).
- Frase de vídeo só é citada com 3+ palavras, sem terminar pendurada ("Se você é de…") e sem anotação
  do time (CTA, público, teste).
- Tudo em minúscula, como se escreve no WhatsApp, com o acento que o nome perdeu; sigla e código em
  maiúscula (CP3, PVA, HB20); cidade com maiúscula.

**Para o time de tráfego:** nomeie o anúncio com o produto e a medida, sem preço —
`ADS - ESTATICO - PORCELANATO 70X70 ACETINADO`. É isso que vira a frase que o dono lê.

Produto novo que não está sendo reconhecido: acrescente a palavra em `PRODUTOS` (e o acento em
`ACENTOS`, se perdeu), com um caso em `tests/placar-semanal.test.ts`.

## O segmento (decide a pergunta e as dicas)

`segmentoDeVoz` olha, nesta ordem: o **nome** quando é inequívoco ("Tintas", "Pisos", "Ótica",
"Barbearia", "Solar", "Pneus", "Estofados", "Madeireira", "Bazar"), o nicho **Energia solar**, o
**CNAE principal** (gravado pela consulta da Receita) e, por fim, o **nicho**. Nada casou → `varejo`.

Segmentos: construcao, tintas, pisos, madeira, ferragens, moveis, solar, otica, estetica, barbearia,
veterinaria, farmacia, clinica, contabilidade, autopecas, pneus, veiculos, suplementos, pet, plantas,
alimentacao, bazar, varejo.

**Dica:** uma linha, sobre transformar conversa em venda (atendimento, primeira resposta, retorno,
oferta junto) — nunca dica genérica de marketing. Gira por semana (`semanaDoAno` + cliente). Tem
precedência a **dica dos números**: produto com 5+ resultados e custo 25% abaixo da média vira
"se tiver estoque pra mais 15 dias, me avisa que a gente segura esse anúncio no ar".

Para acrescentar ou trocar dica: `lib/traffic/placar-voz.ts`, no mínimo 5 por segmento, até 180
caracteres, sem jargão (o teste confere). Nicho novo: tipo em `SegmentoVoz`, perfil em `PERFIS_VOZ`,
regra em `segmentoDeVoz` e uma linha no teste. Use `nichos.md` (pesquisa com fontes) como base.

## Quando NÃO sai placar

| Situação | O cliente recebe | O time recebe (grupo do tráfego) |
|---|---|---|
| Anúncio não rodou | a legenda neutra de sempre | "explicar ao cliente ainda hoje" |
| Zero resultado | a legenda neutra | idem |
| Queda de 25% ou mais | o placar, com a queda escrita | idem, com a % |
| Leitura por anúncio falhou | o placar sem a linha dos anúncios | — |

Notícia ruim é do gestor, com a causa e o que já foi feito (regra 4) — o robô não explica queda.

## Ligar, revisar, prever

Chave `agency_settings.placar_semanal`:
- vazia ou `off` → legenda de sempre;
- `revisao` → o cliente recebe a de sempre; os placares vão para o grupo do tráfego ler;
- `on` → o placar vai para o cliente.

Prévia (não envia, não grava), de dentro da VPS:

```bash
SECRET=$(grep ^CRON_SECRET= /opt/loneos/.env | cut -d= -f2)
curl -s -H "Authorization: Bearer $SECRET" \
  "http://localhost:3000/api/system/weekly-reports?placar=1&todos=1&hoje=2026-10-26"   # todos
curl -s -H "Authorization: Bearer $SECRET" \
  "http://localhost:3000/api/system/weekly-reports?placar=1&cliente=<id>"              # um
```

**Antes de ligar (`on`):** mostre ao Roberto a prévia de todos e espere o OK dele — é texto que
sai para grupo de cliente. Mudou o texto ou as dicas? Atualize o manual (`app/sobre/page.tsx`, módulo
Tráfego Pago) e registre em `platform_updates`.
