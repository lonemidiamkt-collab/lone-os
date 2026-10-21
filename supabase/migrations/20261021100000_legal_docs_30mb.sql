-- 21/10/2026: contrato social escaneado passa de 10 MB (cliente DOMINOS não conseguia concluir o
-- cadastro). O formulário e a rota de upload aceitam 30 MB para contrato social e documento com foto
-- (lib/onboarding/etapas.ts); o bucket privado legal-docs tinha teto de 10 MB e recusava antes.
update storage.buckets set file_size_limit = 31457280 where id = 'legal-docs';
