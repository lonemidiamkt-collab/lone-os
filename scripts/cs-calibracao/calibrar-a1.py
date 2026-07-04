#!/usr/bin/env python3
# Calibração do classificador A1: usa o PROMPT REAL (extraído de classifier.ts) e chama a OpenAI
# igual ao chatJson (gpt-4o-mini, json_schema strict). Read-only. Concorrência leve.
import json, os, re, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

KEY = os.environ["OPENAI_API_KEY"]
SRC = open(os.environ.get("CLASSIFIER_SRC", os.path.join(os.path.dirname(__file__), "..", "..", "lib", "cs", "classifier.ts")), encoding="utf-8").read()
m = re.search(r"export const A1_SYSTEM_INSTRUCTIONS = `(.*?)`;", SRC, re.S)
INSTR = m.group(1)
CASOS = json.load(open(sys.argv[1], encoding="utf-8"))
AMBIG = set(json.load(open(sys.argv[2], encoding="utf-8"))) if len(sys.argv) > 2 else set()
EQUIPE = ["Equipe Lone", "Lone", "Carlos", "Pedro", "Julio", "Roberto"]
TIPOS = ["arte_nova","ajuste_arte","cobranca_prazo","feedback_campanha","duvida","duvida_estrategia","reclamacao","info_operacional","elogio","agendamento","retracao","conversa"]
import datetime
HOJE = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")

SCHEMA = {"type":"object","additionalProperties":False,"required":["itens","observacao"],"properties":{
  "itens":{"type":"array","items":{"type":"object","additionalProperties":False,
    "required":["is_demanda","tipo","urgencia","confianca","resumo","trecho_origem","cliente"],
    "properties":{"is_demanda":{"type":"boolean"},"tipo":{"type":"string","enum":TIPOS},
      "urgencia":{"type":"string","enum":["baixa","media","alta"]},"confianca":{"type":"number"},
      "resumo":{"type":"string"},"trecho_origem":{"type":"string"},"cliente":{"type":["string","null"]}}}},
  "observacao":{"type":["string","null"]}}}

def build_system(cli, nicho):
    return (INSTR + "\n\n# Contexto deste grupo\n"
        + f"- Agora: {HOJE}\n- Cliente: {cli}" + (f" ({nicho})" if nicho else "") + "\n"
        + "- Briefing do cliente (tom, o que costuma pedir): (sem briefing)\n"
        + f"- Equipe da Lone neste grupo (NÃO são clientes): {', '.join(EQUIPE)}\n"
        + f"- Clientes neste grupo: {cli}")

def classify(caso):
    autor = caso.get("autor","cliente")
    user = "Classifique o bloco de mensagens abaixo:\n\n" + "\n".join(f"{autor}: {t}" for t in caso["msgs"])
    body = {"model":"gpt-4o-mini","max_tokens":2048,"temperature":0,
      "response_format":{"type":"json_schema","json_schema":{"name":"cs_classificacao","strict":True,"schema":SCHEMA}},
      "messages":[{"role":"system","content":build_system(caso["cliente"],caso.get("nicho"))},{"role":"user","content":user}]}
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions",
      data=json.dumps(body).encode(), headers={"Content-Type":"application/json","Authorization":"Bearer "+KEY})
    try:
        r = json.load(urllib.request.urlopen(req, timeout=60))
        return caso, json.loads(r["choices"][0]["message"]["content"])
    except Exception as e:
        return caso, {"_erro": str(e)}

acertos=tipoOk=tipoTotal=nEstrito=0; falhas=[]; ambig_notas=[]
with ThreadPoolExecutor(max_workers=3) as ex:
    resultados = list(ex.map(classify, CASOS))

for caso, out in resultados:
    cid = caso["id"]; is_amb = cid in AMBIG
    if "_erro" in out:
        falhas.append(f"✗ {cid}: ERRO {out['_erro'][:80]}"); continue
    itens = out.get("itens",[])
    dem = next((i for i in itens if i.get("is_demanda")), None)
    got = dem is not None
    ok = got == caso["demanda"]
    got_tipo = (dem or (itens[0] if itens else {})).get("tipo","(nenhum)")
    tok = got_tipo in caso["tipo"] if caso.get("tipo") else True
    conf = f" conf={dem['confianca']}" if dem else (f" conf={itens[0]['confianca']}" if itens else "")
    line = f"{cid}: is_demanda esp={caso['demanda']} got={got}{conf}" + ("" if tok else f" · TIPO esp[{'|'.join(caso['tipo'])}] got[{got_tipo}]")
    if is_amb:
        if not ok or not tok: ambig_notas.append(f"~ {line} [ambíguo — informativo]")
        continue
    nEstrito+=1
    if ok: acertos+=1
    if caso.get("tipo"):
        tipoTotal+=1
        if tok: tipoOk+=1
    if not ok or not tok:
        falhas.append(f"✗ {line}" + (f" [{caso.get('nota','')}]" if caso.get('nota') else ""))

print(f"\n=== CALIBRAÇÃO A1 ({len(CASOS)} casos; {nEstrito} no placar, {len(AMBIG)} ambíguos fora) ===")
print(f"is_demanda: {acertos}/{nEstrito} ({round(acertos/nEstrito*100)}%)")
print(f"tipo:        {tipoOk}/{tipoTotal} ({round(tipoOk/tipoTotal*100)}%)")
print(f"\n--- DIVERGÊNCIAS NO PLACAR ({len(falhas)}) ---")
for f in sorted(falhas): print(f)
print(f"\n--- AMBÍGUOS (o que o modelo fez; NÃO conta como erro) ({len(ambig_notas)}) ---")
for f in sorted(ambig_notas): print(f)
