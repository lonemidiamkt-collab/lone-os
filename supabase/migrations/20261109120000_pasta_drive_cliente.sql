-- 20261109120000_pasta_drive_cliente.sql — a pasta do cliente no Google Drive da Lone (lib/drive/).
--
-- Roberto (09/11/2026): quando o cliente termina o cadastro pelo link, o Lone OS cria
--   Clientes Lone Mídia › <Cliente> › Documentos  (só admin)
--                                   › Fotos e Vídeos (social e designer do cliente)
-- e a ficha guarda os dois links separados. O link de Fotos e Vídeos também vai para clients.drive_link
-- (o "Drive" que o pedido de arte já mostra) quando o cliente ainda não tinha um.
--
-- Só ACRESCENTA colunas: nada existente muda. Os ids são do Drive (o link se monta a partir deles).

alter table public.clients
  add column if not exists drive_pasta_id         text,
  add column if not exists drive_documentos_id    text,
  add column if not exists drive_fotos_id         text,
  -- e-mails a que o PRÓPRIO Lone OS deu acesso em Fotos e Vídeos: só esses ele tira quando o social/designer
  -- muda. Quem alguém compartilhou à mão nunca é tirado.
  add column if not exists drive_acessos          jsonb not null default '[]'::jsonb,
  add column if not exists drive_sincronizado_em  timestamptz,
  -- falha que impediu a pasta (frase pronta, a ficha mostra com "Tentar de novo"); null = sem falha
  add column if not exists drive_erro             text,
  -- o que saiu pela metade na última sincronia (arquivo que não copiou, pessoa sem e-mail na equipe)
  add column if not exists drive_avisos           text[] not null default '{}',
  -- trava: duas sincronias do mesmo cliente ao mesmo tempo criariam duas pastas
  add column if not exists drive_trava_em         timestamptz;

comment on column public.clients.drive_pasta_id is 'Pasta do cliente no Drive da Lone (Clientes Lone Mídia › <Cliente>) — lib/drive/sincronizar-pasta.ts';
comment on column public.clients.drive_acessos is 'E-mails a que o Lone OS deu acesso em Fotos e Vídeos (só esses ele tira)';
