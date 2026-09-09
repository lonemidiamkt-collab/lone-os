-- OS CAMPOS QUE O FORMULÁRIO NUNCA PEDIU
--
-- Roberto (09/09) listou o que o cliente informa: telefone da empresa, WhatsApp, telefone do
-- responsável, Instagram… "porém alguns desses dados não aparecem na ficha".
--
-- A auditoria mostrou que NADA se perde no caminho: as 12 submissões existentes têm 100% dos
-- campos em `clients`. Três dos campos da lista simplesmente nunca foram perguntados — e
-- "não aparece na ficha" é o mesmo sintoma, com outra causa.
--
--   • telefone da EMPRESA: não existia coluna. `phone` guarda o WhatsApp do responsável, que é
--     outra coisa — o fixo da loja e o celular de quem responde não são o mesmo número.
--   • telefone do RESPONSÁVEL separado do WhatsApp: nem coluna, nem campo.
--   • @ do Instagram: a coluna `instagram_user` já existia, mas quem a preenchia era o
--     mapeamento da Meta. O cliente, que sabe o próprio @, nunca foi perguntado — e 29 dos 50
--     ativos estão sem.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_phone text;
COMMENT ON COLUMN clients.company_phone IS
  'Telefone fixo/comercial da empresa. NÃO confundir com `phone`, que é o WhatsApp do responsável.';

ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_phone text;
COMMENT ON COLUMN clients.contact_phone IS
  'Telefone do responsável quando diferente do WhatsApp (`phone`).';

-- O formulário também passa a gravá-los, para a aprovação poder copiar de lá.
ALTER TABLE client_onboarding_submissions ADD COLUMN IF NOT EXISTS company_phone text;
ALTER TABLE client_onboarding_submissions ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE client_onboarding_submissions ADD COLUMN IF NOT EXISTS instagram_user text;
