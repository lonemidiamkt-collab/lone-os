-- COLABORADORES, LINK E VISIBILIDADE DA REUNIÃO NO CALENDÁRIO
--
-- Roberto (08/09): "no sistema de calendário, deixar a opção de marcar a reunião certinha, colocar
-- alguém do sistema como colaborador daquela reunião ou atividade daquela data — por exemplo o
-- Thiago poder convidar o Carlos para aquele evento — e poder colocar links como invite do Meet e
-- briefing, e o sistema identificar que é uma reunião e adicionar no histórico do cliente e nas
-- OKRs, para podermos ver quem teve ou não teve reunião."
--
-- A tabela já tinha `attendees text[]` desde o começo, e nunca foi preenchida por nada: o
-- agendador antigo não expunha o campo. Em vez de criar outra coluna com o mesmo sentido, esta
-- migration reaproveita `attendees` e acrescenta só o que falta de verdade.

ALTER TABLE meetings
  -- O link da chamada. Separado de `location`, que é texto livre ("Online", "na loja"): o link é
  -- clicável, entra no lembrete e no convite de calendário — location não.
  ADD COLUMN IF NOT EXISTS link_reuniao text,
  -- Quem criou o convite. `created_by` já existe, mas guarda quem gravou a linha (pode ser o
  -- agente); este diz quem CONVIDOU, que é o que a pessoa convidada quer saber.
  ADD COLUMN IF NOT EXISTS convidado_por text;

COMMENT ON COLUMN meetings.attendees IS
  'Colaboradores convidados, por NOME (o mesmo de team_members). O responsável não se repete aqui. Existia desde o início e nunca foi preenchido — o agendador antigo não expunha o campo.';
COMMENT ON COLUMN meetings.link_reuniao IS
  'Link da chamada (Meet/Zoom). Separado de location porque é clicável e entra no lembrete.';

-- Quem foi convidado para quê: é como o Meu Trabalho e o calendário de cada pessoa acham as
-- reuniões em que ela participa sem ser a responsável.
CREATE INDEX IF NOT EXISTS meetings_attendees ON meetings USING gin (attendees);
