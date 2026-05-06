# Guia — Subir os Templates no D4Sign

Passo-a-passo pra cadastrar os 3 contratos no D4Sign como templates e devolver pro sistema os UUIDs necessários.

**Tempo estimado:** ~15 min (5 min por template).

---

## Pré-requisito

Você vai precisar de:
- Login no painel do D4Sign: https://secure.d4sign.com.br
- Os 3 arquivos `.docx` na pasta `contract-templates/`:
  - `Contrato - Social Media.docx`
  - `Contrato - Tráfego Pago.docx`
  - `Contrato - Lone Growth.docx`

Se o `.docx` não existir, rode `cd contract-templates && node convert.js` pra gerá-los a partir dos `.md`.

---

## Passo 1 — Criar (ou identificar) o Cofre

O D4Sign organiza documentos em **Cofres** (Safes). Cada contrato vai viver dentro de um cofre. Recomendação: **usar um único cofre pra todos os 3** → "Contratos Lone Midia".

1. Entre no painel D4Sign
2. Menu lateral → **Cofres**
3. Se já existir um "Contratos Lone Midia": **pule pro próximo passo**. Se não:
   - Clique **Novo Cofre**
   - Nome: `Contratos Lone Midia`
   - Salvar
4. **COPIE o UUID do cofre** (aparece na URL quando você abre o cofre, ou no detalhe do cofre). Formato: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.
   - Anote aqui: `safe_id = _______________________________`

> Esse UUID é o **mesmo pros 3 contratos** (se estiverem todos no mesmo cofre).

---

## Passo 2 — Subir o primeiro template (Social Media)

1. No painel D4Sign, menu lateral → **Templates** (ou "Modelos")
2. Clique **Novo Template** / **Adicionar Template**
3. **Upload do arquivo:** selecione `Contrato - Social Media.docx`
4. **Nome do template:** `Contrato Social Media - Lone Midia`
5. **Cofre:** selecione `Contratos Lone Midia`
6. Avance pra tela de edição dos merge fields (D4Sign detecta automaticamente os textos `{{campo}}` no documento).

### 2.1 — Marcar os merge fields

O D4Sign vai pedir pra você confirmar/nomear cada variável detectada. A lista que precisa existir no template Social Media:

**Dados do cliente:**
- `cliente_razao_social`
- `cliente_cnpj`
- `cliente_endereco`
- `cliente_numero`
- `cliente_bairro`
- `cliente_cidade`
- `cliente_cep`
- `cliente_representante_nome`
- `cliente_representante_cpf`
- `cliente_email`

**Comerciais:**
- `valor_mensal_numero`
- `valor_mensal_extenso`
- `duracao_meses_numero`
- `duracao_meses_extenso`
- `dia_pagamento_numero`
- `dia_pagamento_extenso`

**Assinatura:**
- `data_dia`
- `data_mes_extenso`
- `data_ano`
- `lm_representante_nome`

**Total: 20 merge fields** no Social Media.

> ⚠️ Use **exatamente esses nomes** (snake_case, sem acentos). O nome precisa bater com o que o sistema manda via API — diferença de 1 caractere já quebra a automação.

### 2.2 — Salvar e anotar o UUID

7. Salve o template
8. **COPIE o UUID do template** (aparece na URL do template ou na lista de templates)
   - Anote aqui: `social_media_template_id = _______________________________`

---

## Passo 3 — Subir o segundo template (Tráfego Pago)

Repita o Passo 2 com:

- Arquivo: `Contrato - Tráfego Pago.docx`
- Nome: `Contrato Tráfego Pago - Lone Midia`
- Cofre: `Contratos Lone Midia`

### Merge fields do Tráfego Pago

Mesma lista de 20 do Social Media **MAIS 1 extra**:

- ➕ `cliente_nicho`

**Total: 21 merge fields** no Tráfego Pago.

Anote o UUID:
- `trafego_template_id = _______________________________`

---

## Passo 4 — Subir o terceiro template (Lone Growth)

Repita o Passo 2 com:

- Arquivo: `Contrato - Lone Growth.docx`
- Nome: `Contrato Lone Growth - Lone Midia`
- Cofre: `Contratos Lone Midia`

### Merge fields do Lone Growth

**Mesma lista de 21** do Tráfego Pago (incluindo `cliente_nicho`).

**Total: 21 merge fields** no Lone Growth.

Anote o UUID:
- `lone_growth_template_id = _______________________________`

---

## Passo 5 — Me enviar os UUIDs

Cole aqui no chat:

```
safe_id                   = [uuid do cofre]
social_media_template_id  = [uuid do template social media]
trafego_template_id       = [uuid do template tráfego pago]
lone_growth_template_id   = [uuid do template lone growth]
```

Com esses 4 UUIDs eu:
1. Cadastro na tabela `contract_templates` do Supabase (UPDATE nos 3 registros já existentes)
2. Confirmo que `D4SIGN_API_TOKEN` e `D4SIGN_CRYPT_KEY` estão configurados no `.env`
3. Rodo um teste de geração ponta-a-ponta com um cliente fake
4. Te confirmo que a automação tá funcionando

---

## Dicas & Troubleshooting

### "O D4Sign não detectou minhas variáveis automaticamente"

Alguns painéis do D4Sign pedem que você **selecione o texto `{{campo}}` no documento e clique em "Marcar como variável"** manualmente. Se for o caso, faça isso pra cada uma das 20-21 variáveis por template.

### "Qual formato eu configuro pra cada variável?"

Pra todas: **Tipo = Texto livre** (não "data", não "número"). O sistema manda tudo formatado como string.

### "E se eu quiser testar antes de subir pra valer?"

O D4Sign tem modo **Sandbox** (https://sandbox.d4sign.com.br). Se quiser testar, suba nele primeiro, pega os UUIDs, e configura `D4SIGN_API_URL=https://sandbox.d4sign.com.br/api/v1` no `.env` pra teste. Depois passa pro `secure` em produção.

### "Posso editar o template depois?"

Sim. No painel D4Sign, abre o template, edita, salva. **O UUID não muda**, então não precisa me avisar — as próximas gerações já pegam a versão nova automaticamente.

### "O que acontece se eu esquecer de marcar um merge field?"

O sistema vai gerar o contrato com `{{campo_esquecido}}` literal no texto. Cliente vai ver isso no PDF. Por isso o Passo 2.1 é crítico — confere 2 vezes a lista.

---

## Checklist final antes de me passar os UUIDs

- [ ] Cofre `Contratos Lone Midia` criado
- [ ] Template Social Media subido com 20 merge fields
- [ ] Template Tráfego Pago subido com 21 merge fields (incluindo `cliente_nicho`)
- [ ] Template Lone Growth subido com 21 merge fields (incluindo `cliente_nicho`)
- [ ] Os 4 UUIDs (1 cofre + 3 templates) anotados

Feito isso, me manda os UUIDs e eu sigo.
