# Erro recuperável — regra do Lone OS

> Use este texto como prompt: para **construir** qualquer tela ou automação, e para **auditar** o
> sistema inteiro atrás do mesmo tipo de falha. Ele vale para o cliente (link de cadastro, portal
> de resultados) e para a equipe (painel, quadros, comercial).

## De onde veio

Em 21/10/2026 o Roberto testou o link de cadastro e mandou o cartão CNPJ no campo do logo. O
campo mostrou "Enviado com sucesso" com uma imagem quebrada e **sumiu com os botões** — não havia
como trocar nem remover. O cliente que erra fica preso, e a única saída é chamar alguém da Lone.

Na mesma semana apareceram parentes do mesmo problema:
- o "Próximo" deixava passar obrigatório vazio e o cliente só descobria no fim;
- o rascunho digitado não chegava à ficha porque o envio final travava em outra coisa;
- a revisão de arte que **não conseguiu ver** a imagem escrevia "✅ arte conferida".

Todos são a mesma pergunta não feita: **"e se a pessoa (ou o sistema) errar aqui?"**

## A regra

**Toda ação que uma pessoa pode fazer errado precisa poder ser desfeita por ela mesma, na hora,
sem chamar ninguém — e toda falha do sistema precisa aparecer como falha.**

## Os oito pontos

1. **Tudo que se envia, se troca.** Arquivo enviado aparece como ele é (miniatura se for imagem,
   ícone e nome se for PDF) com **Trocar** e **Remover**. Campo de vários arquivos remove item a
   item. Nunca esconder o botão depois do envio.
2. **Toda escolha se desfaz.** Seleção, status, arrastar no quadro, marcar como feito: dá para
   voltar. Ação que apaga ou manda para fora pede confirmação **ou** oferece "Desfazer" por alguns
   segundos.
3. **Validação na hora e no lugar certos.** O erro aparece no campo/etapa onde nasce, não no fim.
   Botão de avançar que não avança **diz o que falta**. Limite (tamanho, formato) é dito antes de
   o arquivo ser escolhido.
4. **Mensagem de erro diz o que houve e o que fazer.** "Arquivo com 14 MB — o limite é 10 MB;
   mande o cartão CNPJ" e não "Erro no upload". Sem culpar a pessoa, sem jargão.
5. **Falha nunca vira sucesso, vazio ou zero.** Se o sistema não conseguiu (rede, IA, Meta,
   imagem, permissão), ele diz "não consegui" — nunca "✅", "nenhum problema", lista vazia ou R$ 0.
   E registra o erro onde a equipe vê (Central de Automações, sino, log).
6. **Mostre o que foi entendido antes de confirmar.** Resumo/prévia do que vai ser gravado ou
   enviado, com o nome do arquivo e os dados lidos — principalmente o que sai para o cliente.
7. **O que sai para fora é irreversível: trate como tal.** WhatsApp, e-mail, contrato, portal:
   prévia, lista exata de destinatários, confirmação, e proteção contra clique duplo
   (idempotência). Errou o envio? Avise a equipe com o que saiu.
8. **O que foi digitado não se perde.** Rascunho salvo e visível para a equipe; voltar de etapa não
   apaga; erro de rede mantém o que foi preenchido; sessão expirada não descarta o formulário.

## Como auditar

Para cada fluxo — link de cadastro, portal do cliente, ficha do cliente, quadros (social, design,
tráfego), entrega e revisão de arte, demandas, comercial/CRM, contratos, cofre de acessos,
relatórios e automações — percorra cada interação e responda:

| Pergunta | Se a resposta for "não", é falha |
|---|---|
| Se a pessoa errar aqui, ela desfaz sozinha? | ponto 1–2 |
| O sistema avisa do erro no lugar onde ele nasceu? | ponto 3 |
| A mensagem diz o que fazer? | ponto 4 |
| Se a operação falhar, isso aparece como falha? | ponto 5 |
| A pessoa vê o que vai ser gravado/enviado antes? | ponto 6–7 |
| O que foi digitado sobrevive a voltar, recarregar e cair a rede? | ponto 8 |

Saída: tabela **fluxo × problema × quem é afetado (cliente/equipe) × gravidade × correção**,
corrigida da mais grave para a mais leve, cada correção com teste que reproduz o erro original.

## Prompt pronto (para colar numa sessão)

> Audite o Lone OS (~/dev/lone-os) com a regra de docs/ERRO_RECUPERAVEL.md. Percorra os fluxos
> listados na seção "Como auditar", lendo o código de cada tela e rota (não só o componente: siga a
> decisão até o servidor). Para cada ponto em que uma pessoa que erra fica presa, ou em que uma
> falha do sistema aparece como sucesso, vazio ou zero, registre fluxo, arquivo:linha, o que
> acontece hoje, quem é afetado e a correção. Me mostre a tabela antes de mudar qualquer coisa e
> corrija na ordem que eu aprovar, com teste para cada caso.
