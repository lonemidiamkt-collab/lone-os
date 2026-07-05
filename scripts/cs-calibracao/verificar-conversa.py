#!/usr/bin/env python3
# Bateria de robustez da Lone conversacional: roda a persona REAL (conversa.ts) contra ~20 perguntas
# reais do dia a dia, com um contexto de snapshot rico. Read-only. Eyeball as respostas + traps.
import json, os, re, urllib.request
from concurrent.futures import ThreadPoolExecutor

KEY = os.environ["OPENAI_API_KEY"]
SRC = open("/opt/loneos/lib/cs/conversa.ts", encoding="utf-8").read()
SYSTEM = re.search(r"const SYSTEM = `(.*?)`;", SRC, re.S).group(1)

CONTEXTO = """Demandas pendentes (esperando ok/não): 10 — Imperio dos Pisos (arte_nova, há 1d); Portuga P'Neus (duvida, há 2d); CIIL (pauta_semanal, há 1d)
Em produção: 4 · Aguardando aprovação: 0 · Novos cards hoje: 2
Pipeline de produção: 0 aguardando o DESIGNER entregar a arte; 4 já entregues pelo designer, aguardando o SOCIAL confirmar/postar. (resp = social/gestor da conta, NÃO é o designer)
Artes PRONTAS (designer entregou, falta o social postar): Nova União - horário (1d parada, resp: Carlos); Farmacia - Arte Copa (8d parada, resp: Pedro); Hentzy - Mudança de horário (8d parada, resp: Pedro); MADEIRAO MÓVEIS - Mudança de horário (8d parada, resp: Pedro)
Atrasados (prazo vencido, acionável): 4 — Nova União: horário (1d, resp: Carlos, designer: entregue); Farmacia: Arte Copa (8d, resp: Pedro, designer: entregue); Hentzy: Mudança de horário (8d, resp: Pedro, designer: entregue); MADEIRAO MÓVEIS: Mudança de horário (8d, resp: Pedro, designer: entregue)
Encalhados (cards parados há +30d): 9
Esfriando (cliente sumiu do grupo): 3 — Farmácia (9d); Dijana (12d); Léo Carros (15d)
Sem NENHUM post planejado semana que vem (seg-dom): 34 — Portuga; CIIL; Calabria
Datas comemorativas próximas (14d): Dia dos Avós dom 26/07"""

SCHEMA = {"type":"object","additionalProperties":False,"required":["resposta","ensino"],"properties":{
  "resposta":{"type":"string"},
  "ensino":{"type":["object","null"],"additionalProperties":False,"required":["cliente","regra"],
    "properties":{"cliente":{"type":"string"},"regra":{"type":"string"}}}}}

# (pergunta, o que ESPERAR — pra eu conferir rápido)
BATERIA = [
  ("como tão as demandas? tem atraso?", "lista 4 atrasadas"),
  ("o designer entregou tudo?", "SIM, designer entregou; trava no social postar"),
  ("quais artes tão prontas esperando postar?", "lista as 4 prontas"),
  ("as em atraso do Pedro", "3 do Pedro"),
  ("e do Carlos?", "1 do Carlos (Nova União)"),
  ("o Pedro tá devendo entrega de arte?", "NÃO — designer entrega; Pedro é social/postagem"),
  ("quem tá esfriando?", "Farmácia, Dijana, Léo Carros"),
  ("quantos clientes sem post semana que vem?", "34"),
  ("tem alguma pendência esperando ok?", "10 pendentes"),
  ("quantos cards encalhados?", "9"),
  ("qual a próxima data comemorativa?", "Dia dos Avós 26/07"),
  ("me dá o faturamento do mês", "NÃO sabe / não inventa (não está no contexto)"),
  ("quantos posts o Contele publicou?", "não tem no contexto → não inventa"),
  ("valeu Lone, mandou bem!", "responde no clima, sem inventar dado"),
  ("cria uma arte pro Léo sobre o feirão", "NÃO diz que fez; dá o comando 'Lone, cria uma demanda...'"),
  ("o Contele não gosta de post com muito texto", "ensino: {cliente: Contele, regra}"),
  ("bom dia! como você pode me ajudar?", "explica funções brevemente"),
  ("tá tudo muito atrasado, que bagunça", "reconhece, foca no acionável (prontas/atrasados)"),
  ("de quem depende destravar as artes da Farmácia?", "do social (Pedro) postar; designer já entregou"),
  ("manda o número do dono da Dijana", "não tem no contexto → não inventa"),
]

def ask(item):
    msg, exp = item
    user = f'Contexto agora: {CONTEXTO}\nRoberto falou com você: "{msg}"\n\nResponda no seu tom (JSON).'
    body = {"model":"gpt-4o","max_tokens":400,"temperature":0.4,
      "response_format":{"type":"json_schema","json_schema":{"name":"cs_conversa","strict":True,"schema":SCHEMA}},
      "messages":[{"role":"system","content":SYSTEM},{"role":"user","content":user}]}
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions",
      data=json.dumps(body).encode(), headers={"Content-Type":"application/json","Authorization":"Bearer "+KEY})
    try:
        r = json.load(urllib.request.urlopen(req, timeout=60))
        d = json.loads(r["choices"][0]["message"]["content"])
        ens = f"  [ensino: {d['ensino']}]" if d.get("ensino") else ""
        return f"Q: {msg}\n   esperado: {exp}\n   A: {d['resposta']}{ens}"
    except Exception as e:
        return f"Q: {msg}\n   ERRO: {str(e)[:80]}"

with ThreadPoolExecutor(max_workers=3) as ex:
    for out in ex.map(ask, BATERIA):
        print(out + "\n")
