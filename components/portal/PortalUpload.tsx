"use client";

import { useCallback, useRef, useState } from "react";

// O cliente manda material pelo painel (Roberto, 31/08). Hoje foto de produto, logo e tabela de
// preço chegam pelo WhatsApp e somem na rolagem do grupo — quem vai fazer a arte precisa caçar a
// mensagem de três dias atrás. Aqui o arquivo fica preso ao cliente, com a observação e a data.
//
// A observação é o que transforma "IMG_4471.jpg" em material utilizável, e por isso ela vem ANTES
// do arquivo na tela: quem só anexa e some deixa o time adivinhando pra que serve aquilo.

const MAX_MB = 25;

export default function PortalUpload({ token, clientName }: { token: string; clientName: string }) {
  const [observacao, setObservacao] = useState("");
  const [enviadoPor, setEnviadoPor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviados, setEnviados] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const enviar = useCallback(async (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    setErro(null);
    setEnviando(true);
    const ok: string[] = [];
    try {
      // Um de cada vez: o cliente costuma mandar do celular, e mandar 8 fotos em paralelo numa
      // rede fraca faz todas falharem juntas. Uma a uma, o que subiu fica.
      for (const arquivo of Array.from(arquivos)) {
        if (arquivo.size > MAX_MB * 1024 * 1024) {
          setErro(`"${arquivo.name}" passa de ${MAX_MB} MB. Se for vídeo, mande um trecho.`);
          continue;
        }
        const fd = new FormData();
        fd.append("arquivo", arquivo);
        if (observacao.trim()) fd.append("observacao", observacao.trim());
        if (enviadoPor.trim()) fd.append("enviado_por", enviadoPor.trim());

        const res = await fetch(`/api/portal/${token}/upload`, { method: "POST", body: fd });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setErro(d?.error || `Não consegui enviar "${arquivo.name}".`);
          continue;
        }
        ok.push(arquivo.name);
      }
      if (ok.length) {
        setEnviados((prev) => [...ok, ...prev].slice(0, 12));
        setObservacao("");
      }
    } catch {
      setErro("Falha de conexão. Tente de novo.");
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [token, observacao, enviadoPor]);

  return (
    <section className="rounded-2xl p-5 lg:p-6 mb-5" style={{ background: "#0b0e1e", border: "1px solid #1a1f33" }}>
      <h2 className="text-base lg:text-lg font-bold mb-1" style={{ color: "#eef0f6" }}>
        Enviar material
      </h2>
      <p className="text-xs lg:text-sm mb-4" style={{ color: "#8b91a1" }}>
        Foto de produto, logo, tabela de preço, vídeo da loja — o que chegar aqui fica guardado com
        o time da {clientName}, sem se perder no WhatsApp.
      </p>

      <label className="block text-xs mb-1" style={{ color: "#8b91a1" }}>
        O que é esse material? <span style={{ color: "#6b7280" }}>(ajuda muito)</span>
      </label>
      <textarea
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        rows={2}
        placeholder="Ex.: fotos do produto novo que chegou, pra usar nos posts da semana"
        className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none mb-3"
        style={{ background: "#060814", border: "1px solid #1a1f33", color: "#eef0f6" }}
      />

      <label className="block text-xs mb-1" style={{ color: "#8b91a1" }}>Seu nome</label>
      <input
        value={enviadoPor}
        onChange={(e) => setEnviadoPor(e.target.value)}
        placeholder="Quem está enviando"
        className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-4"
        style={{ background: "#060814", border: "1px solid #1a1f33", color: "#eef0f6" }}
      />

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/mp4,video/quicktime,application/pdf,.csv,.xlsx,.xls"
        onChange={(e) => enviar(e.target.files)}
        disabled={enviando}
        className="hidden"
        id="portal-upload-input"
      />
      <label
        htmlFor="portal-upload-input"
        className="flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold cursor-pointer min-h-[48px] transition-opacity"
        style={{ background: enviando ? "#1a1f33" : "#2B3CFF", color: "#fff", opacity: enviando ? 0.7 : 1 }}
      >
        {enviando ? "Enviando…" : "📎 Escolher arquivos"}
      </label>

      {erro && <p className="text-xs mt-3" style={{ color: "#f0b357" }}>{erro}</p>}

      {enviados.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: "1px solid #1a1f33" }}>
          <p className="text-xs mb-2" style={{ color: "#6ddba0" }}>
            ✓ {enviados.length} arquivo{enviados.length > 1 ? "s" : ""} enviado{enviados.length > 1 ? "s" : ""} — o time já foi avisado
          </p>
          {enviados.map((n, i) => (
            <p key={`${n}-${i}`} className="text-xs truncate" style={{ color: "#8b91a1" }}>{n}</p>
          ))}
        </div>
      )}
    </section>
  );
}
