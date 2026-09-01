// De onde vêm os dados do Instagram. O resto do Radar não sabe (nem deve saber) a resposta.
//
// A proposta original acerta em cheio aqui: se a Meta mudar a API ou aparecer um fornecedor melhor,
// troca-se o provider e nada mais. O que NÃO se confirmou foi a necessidade de um scraper de
// fallback já no começo — a API oficial cobre o caso de uso, e um scraper traz custo por resultado,
// manutenção contínua e uma discussão de termos de uso que não precisamos ter agora.
//
// A implementação de hoje é a Instagram Business Discovery, oficial, com o token que a agência já
// mantém autenticado (escopos instagram_basic + pages_read_engagement). Testada em perfis reais do
// mercado: portobello (663k seguidores), leroymerlinbrasil (1,9M), telhanorte (193k),
// votorantimcimentos (148k) e cec_casaeconstrucao (4k) responderam todos.

export interface PerfilPublico {
  username: string;
  igUserId?: string;
  followers: number;
  mediaCount: number;
}

export interface MidiaPublica {
  mediaId: string;
  mediaType: string;          // IMAGE | VIDEO | CAROUSEL_ALBUM
  permalink?: string;
  caption?: string;
  postedAt?: string;
  likes: number;
  comments: number;
  /** Arquivo da imagem/carrossel. Vem para IMAGE e CAROUSEL; NÃO vem para VIDEO (probe 01/09). */
  mediaUrl?: string;
  /** Miniatura. É o que existe para VIDEO — sem ela, Reel de terceiro seria analisado às cegas. */
  thumbnailUrl?: string;
}

export interface InstagramProvider {
  nome: string;
  /** Perfil + últimas mídias. `null` quando o perfil não existe, é privado ou não é Business. */
  lerPerfil(username: string, limiteMidias?: number): Promise<{ perfil: PerfilPublico; midias: MidiaPublica[] } | null>;
}

/** Erro que vale distinguir: perfil inexistente não é falha de sistema, é cadastro a corrigir. */
export class PerfilInacessivel extends Error {
  constructor(public username: string, public codigo?: number, msg?: string) {
    super(msg || `Perfil @${username} não acessível pela API`);
  }
}

const GRAPH = "https://graph.facebook.com/v21.0";

export function metaProvider(token: string, igUserIdDaAgencia: string): InstagramProvider {
  return {
    nome: "meta-business-discovery",

    async lerPerfil(username, limiteMidias = 25) {
      // O username entra dentro do `fields`, então precisa ser limpo antes: só o que o Instagram
      // aceita num @. Sem isso, um valor com parêntese ou vírgula quebraria a expressão inteira.
      const limpo = username.trim().replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9._]{1,30}$/.test(limpo)) throw new PerfilInacessivel(username, undefined, "username inválido");

      const campos =
        `business_discovery.username(${limpo})` +
        `{username,followers_count,media_count,` +
        `media.limit(${Math.min(50, Math.max(1, limiteMidias))})` +
        `{id,media_type,permalink,caption,timestamp,like_count,comments_count,media_url,thumbnail_url}}`;

      const url = `${GRAPH}/${igUserIdDaAgencia}?fields=${encodeURIComponent(campos)}&access_token=${encodeURIComponent(token)}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
      const json = await res.json().catch(() => null) as {
        business_discovery?: {
          username?: string; followers_count?: number; media_count?: number;
          media?: { data?: Array<Record<string, unknown>> };
        };
        error?: { code?: number; message?: string };
      } | null;

      if (json?.error) {
        // 110 = "Invalid user id": conta pessoal, privada, inexistente, ou username errado. Não é
        // erro de infra — o perfil simplesmente não é legível por esse caminho.
        if (json.error.code === 110) return null;
        throw new PerfilInacessivel(limpo, json.error.code, json.error.message);
      }
      const bd = json?.business_discovery;
      if (!bd) return null;

      const midias: MidiaPublica[] = (bd.media?.data ?? []).map((m) => ({
        mediaId: String(m.id),
        mediaType: String(m.media_type ?? "UNKNOWN"),
        permalink: m.permalink ? String(m.permalink) : undefined,
        caption: m.caption ? String(m.caption) : undefined,
        postedAt: m.timestamp ? String(m.timestamp) : undefined,
        likes: Number(m.like_count ?? 0),
        comments: Number(m.comments_count ?? 0),
        mediaUrl: m.media_url ? String(m.media_url) : undefined,
        thumbnailUrl: m.thumbnail_url ? String(m.thumbnail_url) : undefined,
      }));

      return {
        perfil: {
          username: String(bd.username ?? limpo),
          followers: Number(bd.followers_count ?? 0),
          mediaCount: Number(bd.media_count ?? 0),
        },
        midias,
      };
    },
  };
}
