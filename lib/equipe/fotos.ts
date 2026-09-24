import { normalizar } from "@/lib/notificacoes/visual";

// Foto nova: salve em public/equipe/<primeiro-nome>.jpg (256×256, rosto) e acrescente a linha abaixo.
const FOTOS: Record<string, string> = {
  carlos: "/equipe/carlos.jpg",
  gabriel: "/equipe/gabriel.jpg",
  julio: "/equipe/julio.jpg",
  lucas: "/equipe/lucas.jpg",
  roberto: "/equipe/roberto.jpg",
  rodrigo: "/equipe/rodrigo.jpg",
  thiago: "/equipe/thiago.jpg",
};

/** Foto pelo PRIMEIRO nome (sem acento/caixa): "Roberto Lino" e "Rodrigo Designer" resolvem. */
export function fotoNoMapa(nome: string | null | undefined, mapa: Record<string, string>): string | null {
  const primeiro = normalizar(nome).split(" ")[0];
  return (primeiro && mapa[primeiro]) || null;
}

export function fotoDaPessoa(nome: string | null | undefined): string | null {
  return fotoNoMapa(nome, FOTOS);
}

export function fotoPorPerfil(perfil: { name?: string | null } | null | undefined): string | null {
  return fotoDaPessoa(perfil?.name);
}
