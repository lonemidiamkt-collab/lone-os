"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { estadoDuasEtapas, verificarCodigo } from "@/lib/auth/duas-etapas";
import { falhaDeLogin, fraseDoLogin, type ErroDeLogin, type ResultadoLogin } from "@/lib/auth/login-erro";
import { faseDaInatividade, lerAtividadeCompartilhada } from "@/lib/auth/inatividade";
import { registrarReentrada } from "@/lib/auth/reentrada";
import type { Role } from "@/lib/types";

export interface UserProfile {
  id: string;
  name: string;
  role: Role;
  initials: string;
  color: string;
  email: string;
  teamMemberId?: string; // UUID from team_members table
  /** Últimos 4 dígitos do WhatsApp cadastrado (null = a pessoa é MUDA para o agente). */
  whatsappFinal?: string | null;
}

// LISTA DE RESERVA — a de verdade vem de /api/team/roster (tabela team_members).
//
// Ela existe só pra tela de login não morrer se a busca falhar: sem rede, ninguém entra, e um
// sistema que não deixa a equipe trabalhar por causa de uma consulta é pior que um nome
// desatualizado. Fora esse caso, quem manda é o banco.
//
// NÃO ADICIONE GENTE AQUI. Cadastro é na tela de Equipe, que grava em team_members e cria o login
// junto. Foi manter esta lista em paralelo com a tabela que fez a saída do Pedro Henrique virar
// caça a cinco arquivos — e por pouco não deixou o substituto sem acesso.
export const USER_PROFILES: UserProfile[] = [
  // Socios ADM (Full Access)
  { id: "roberto",  name: "Roberto Lino",    role: "admin",    initials: "RL", color: "text-[#0d4af5]", email: "lonemidiamkt@gmail.com" },
  { id: "lucas",    name: "Lucas Bueno",     role: "admin",    initials: "LB", color: "text-[#0d4af5]", email: "lucas@lonemidia.com" },
  // Gestao e Operacao
  { id: "julio",    name: "Julio",           role: "manager",  initials: "JL", color: "text-[#0d4af5]", email: "julio@lonemidia.com" },
  { id: "carlos",   name: "Carlos Augusto",  role: "social",   initials: "CA", color: "text-[#3b6ff5]", email: "carlos@lonemidia.com" },
  // Thiago assumiu a carteira do Pedro Henrique em 10/08/2026 (mesmo registro, renomeado, pra não
  // perder os 17 clientes). Esta lista é o mapa de login: nome errado aqui = pessoa entra e o
  // sistema não sabe quem ela é.
  { id: "thiago",   name: "Thiago",          role: "social",   initials: "TH", color: "text-[#3b6ff5]", email: "thiago@lonemidia.com" },
  { id: "rodrigo",  name: "Rodrigo",         role: "designer", initials: "RD", color: "text-[#3b6ff5]", email: "rodrigo@lonemidia.com" },
  // Comercial (SDR) — login escopado que vê SÓ o CRM.
  { id: "maria",    name: "Maria Luiza",     role: "comercial", initials: "ML", color: "text-[#0d4af5]", email: "marialuiza@lonemidia.com" },
];

const ROLE_LABELS: Record<Role, string> = {
  admin: "CEO",
  manager: "Gerente",
  traffic: "Tráfego Pago",
  social: "Social Media",
  designer: "Designer",
  comercial: "Comercial (SDR)",
};

/**
 * A sessão caiu com a pessoa no meio do trabalho (25/10/2026, onda 6, itens 8.3 e 8.4). A página NÃO é
 * trocada pela tela de login: fica montada por baixo de "Entre de novo para continuar"
 * (components/ReentrarSessao), com o formulário aberto do jeito que estava.
 *  · "inatividade": 4 h sem uso em nenhuma aba deste navegador (lib/auth/inatividade.ts);
 *  · "expirou": o servidor recusou a sessão mesmo depois de renovar, ou ela foi encerrada em outra aba.
 */
export interface SessaoInterrompida {
  motivo: "inatividade" | "expirou";
  email: string;
  nome: string;
}

interface RoleContextValue {
  /** A equipe de verdade (banco). Use isto em vez de importar USER_PROFILES. */
  profiles: UserProfile[];
  role: Role;
  currentUser: string;
  currentProfile: UserProfile;
  setProfile: (profile: UserProfile) => void;
  setRole: (role: Role) => void;
  setCurrentUser: (name: string) => void;
  roleLabel: string;
  isAuthenticated: boolean;
  hydrated: boolean;
  /** Entrar pela tela de login. A falha diz POR QUÊ (senha × rede × limite × servidor) — 8.5. */
  login: (userId: string, password: string) => Promise<ResultadoLogin>;
  /** "Sair" de propósito: fecha a sessão SÓ neste navegador e volta para a tela de login. */
  logout: () => Promise<void>;
  /**
   * Senha certa, mas a conta tem autenticador e a sessão ainda está em aal1: falta o código.
   * Enquanto isto for true, isAuthenticated fica false — a tela de login mostra o campo do código.
   */
  duasEtapasPendente: boolean;
  confirmarDuasEtapas: (codigo: string) => Promise<{ ok: boolean; erro?: string }>;
  /** Sessão que caiu com a página aberta (ver SessaoInterrompida). null = nada interrompido. */
  sessaoInterrompida: SessaoInterrompida | null;
  /** Entrar de novo como a MESMA pessoa, sem sair da página. */
  reentrar: (senha: string) => Promise<ResultadoLogin>;
  /** 4 h sem uso em nenhuma aba: fecha a sessão só neste navegador e guarda a página por baixo. */
  encerrarPorInatividade: () => Promise<void>;
}

const DEFAULT_PROFILE = USER_PROFILES[0];

const RoleContext = createContext<RoleContextValue>({
  profiles: USER_PROFILES,
  role: "admin",
  currentUser: "Roberto Lino",
  currentProfile: DEFAULT_PROFILE,
  setProfile: () => {},
  setRole: () => {},
  setCurrentUser: () => {},
  roleLabel: "CEO",
  isAuthenticated: false,
  hydrated: false,
  login: async () => ({ ok: false, motivo: "desconhecido", frase: "" }),
  logout: async () => {},
  duasEtapasPendente: false,
  confirmarDuasEtapas: async () => ({ ok: false }),
  sessaoInterrompida: null,
  reentrar: async () => ({ ok: false, motivo: "desconhecido", frase: "" }),
  encerrarPorInatividade: async () => {},
});

/**
 * Quem o SERVIDOR acha que é este token: 200 com o id da equipe; 401 quando recusa (sessão vencida,
 * acesso desativado, autenticador pendente); 0 = sem rede.
 *
 * fetch direto, NÃO `chamar`/authedFetch: esta consulta faz parte da própria entrada. Pelo authedFetch,
 * um 401 aqui ficaria esperando a pessoa entrar de novo — que é justamente o que está acontecendo.
 * 25/10/2026 (8.12): antes ia SEM o token e a rota procurava `team_members.auth_id` (coluna que não
 * existe) — o id da equipe voltava sempre nulo.
 */
async function quemSouEu(token: string | null | undefined): Promise<{ status: number; teamMemberId?: string }> {
  if (!token) return { status: 401 };
  try {
    const res = await fetch("/api/auth/team-member", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { status: res.status };
    const d = await res.json().catch(() => null);
    return { status: res.status, teamMemberId: (d?.id as string | null) ?? undefined };
  } catch {
    return { status: 0 };
  }
}

async function tokenAtual(): Promise<string | null> {
  try { return (await supabase.auth.getSession()).data.session?.access_token ?? null; } catch { return null; }
}

/** Quanto um pedido espera a pessoa entrar de novo antes de desistir e devolver o 401. */
const ESPERA_REENTRADA_MS = 30 * 60 * 1000;

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentProfile, setCurrentProfileState] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [duasEtapasPendente, setDuasEtapasPendente] = useState(false);
  const [sessaoInterrompida, setSessaoInterrompida] = useState<SessaoInterrompida | null>(null);
  // Perfil que passou pela senha e espera o código — vira currentProfile só depois de confirmar.
  const perfilEmEsperaRef = useRef<UserProfile | null>(null);
  // A equipe de verdade, do banco. Começa na reserva pra tela ter o que mostrar no primeiro quadro.
  const [profiles, setProfiles] = useState<UserProfile[]>(USER_PROFILES);

  // O ouvinte de sessão vive o tempo todo e foi criado uma vez. Sem ref ele consultaria pra sempre
  // a lista do primeiro quadro — e alguém que entrasse no time hoje não seria reconhecido até dar
  // F5. É o mesmo tipo de armadilha que criou este bug, agora dentro do React.
  const profilesRef = useRef<UserProfile[]>(USER_PROFILES);
  /** id do usuário já autenticado nesta aba — SIGNED_IN repetido para ele (aba voltando) é ignorado. */
  const usuarioAtivoRef = useRef<string | null>(null);
  useEffect(() => { profilesRef.current = profiles; }, [profiles]);
  // Espelhos para o ouvinte de sessão (criado uma vez) e para a espera do authedFetch.
  const autenticadoRef = useRef(false);
  const perfilAtualRef = useRef<UserProfile>(DEFAULT_PROFILE);
  const interrompidaRef = useRef<SessaoInterrompida | null>(null);
  useEffect(() => { perfilAtualRef.current = currentProfile; }, [currentProfile]);
  /** Saída feita por esta aba: o SIGNED_OUT que vem em seguida sabe se foi "Sair" ou inatividade. */
  const saidaRef = useRef<null | "explicita" | "inatividade">(null);
  /** Login/reentrada desta aba em andamento: o SIGNED_IN que ele dispara é tratado por quem chamou. */
  const entrandoRef = useRef(false);
  /** Pedidos (authedFetch) esperando a pessoa entrar de novo. */
  const retomadaRef = useRef<{ promessa: Promise<boolean>; resolver: (v: boolean) => void } | null>(null);

  const abrirRetomada = useCallback((): Promise<boolean> => {
    if (retomadaRef.current) return retomadaRef.current.promessa;
    let resolver: (v: boolean) => void = () => {};
    const promessa = new Promise<boolean>((r) => { resolver = r; });
    retomadaRef.current = { promessa, resolver };
    return promessa;
  }, []);
  const fecharRetomada = useCallback((voltou: boolean) => {
    const r = retomadaRef.current;
    retomadaRef.current = null;
    r?.resolver(voltou);
  }, []);

  const marcarAutenticado = useCallback((sim: boolean) => {
    autenticadoRef.current = sim;
    setIsAuthenticated(sim);
  }, []);
  const marcarInterrompida = useCallback((s: SessaoInterrompida | null) => {
    interrompidaRef.current = s;
    setSessaoInterrompida(s);
  }, []);

  /** A sessão caiu com a página aberta: guarda a página e pede a senha por cima. */
  const interromper = useCallback((motivo: SessaoInterrompida["motivo"]) => {
    const p = perfilAtualRef.current;
    usuarioAtivoRef.current = null;
    marcarInterrompida(interrompidaRef.current ?? { motivo, email: p.email, nome: p.name });
    marcarAutenticado(false);
    void abrirRetomada();
  }, [abrirRetomada, marcarAutenticado, marcarInterrompida]);

  /** Quem é o dono deste e-mail. Tenta a lista viva; cai na reserva se não achar. */
  const acharPorEmail = useCallback((email?: string | null): UserProfile | undefined => {
    const e = (email ?? "").trim().toLowerCase();
    if (!e) return undefined;
    return profilesRef.current.find((p) => p.email.toLowerCase() === e)
        ?? USER_PROFILES.find((p) => p.email.toLowerCase() === e);
  }, []);

  // A lista viva é carregada UMA vez e quem restaura a sessão espera por ela: quem não está na
  // reserva (Gabriel entrou depois da lista) caía na tela de login a cada reload — a sessão existia,
  // mas `acharPorEmail` rodava antes do roster chegar e não achava o perfil.
  const rosterPronto = useRef<Promise<void> | null>(null);
  const carregarRoster = useCallback((): Promise<void> => {
    if (rosterPronto.current) return rosterPronto.current;
    rosterPronto.current = fetch("/api/team/roster")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const lista = d?.profiles as UserProfile[] | undefined;
        // Lista vazia = consulta falhou. Fica na reserva: melhor nome velho que tela sem ninguém.
        if (lista?.length) { profilesRef.current = lista; setProfiles(lista); }
      })
      .catch(() => { /* sem rede: segue na reserva */ });
    return rosterPronto.current;
  }, []);
  useEffect(() => { void carregarRoster(); }, [carregarRoster]);

  /**
   * Põe esta sessão para dentro: perfil, id da equipe e — se a conta tem autenticador e a sessão está
   * em aal1 — o pedido do código. Um caminho só para restaurar, login, reentrada e outra aba.
   */
  const aplicarSessao = useCallback(async (user: { id: string; email?: string | null }, token?: string | null): Promise<"ok" | "codigo" | "sem-perfil"> => {
    if (!acharPorEmail(user.email)) await carregarRoster(); // fora da reserva: espera a lista viva
    const profile = acharPorEmail(user.email);
    if (!profile) return "sem-perfil";
    // O roster já traz o id da equipe (team_members.id). Só a lista de reserva (roster fora do ar) não
    // tem — aí pergunta ao servidor, junto com o estado das duas etapas, sem somar espera na entrada.
    const [eu, de] = await Promise.all([
      profile.teamMemberId ? Promise.resolve({ status: 200, teamMemberId: profile.teamMemberId }) : (async () => quemSouEu(token ?? await tokenAtual()))(),
      // Sessão de quem tem autenticador precisa estar em aal2 — senão o servidor recusa tudo
      // (auth-server.ts). Pede o código antes de deixar entrar.
      estadoDuasEtapas(),
    ]);
    const teamMemberId = eu.teamMemberId ?? profile.teamMemberId;
    if (de.precisaCodigo) {
      perfilEmEsperaRef.current = { ...profile, teamMemberId };
      setDuasEtapasPendente(true);
      return "codigo";
    }
    usuarioAtivoRef.current = user.id;
    setCurrentProfileState({ ...profile, teamMemberId });
    perfilAtualRef.current = { ...profile, teamMemberId };
    marcarAutenticado(true);
    marcarInterrompida(null);
    fecharRetomada(true);
    return "ok";
  }, [acharPorEmail, carregarRoster, fecharRetomada, marcarAutenticado, marcarInterrompida]);

  // O authedFetch pergunta aqui quando o servidor recusa a sessão mesmo depois de renovar (8.4).
  useEffect(() => {
    let conferindo: Promise<number> | null = null;
    registrarReentrada(async () => {
      if (!autenticadoRef.current && !interrompidaRef.current) return false; // ninguém logado: nada a retomar
      if (!interrompidaRef.current) {
        // 401 nem sempre é sessão: algumas rotas respondem 401 para "não é admin". Antes de cobrir a
        // página, confere com o servidor se ESTE token ainda vale.
        conferindo ??= tokenAtual().then(quemSouEu).then((r) => r.status).finally(() => { conferindo = null; });
        const status = await conferindo;
        if (status !== 401) return false; // sessão boa (era permissão) ou sem rede: não tranca a página
        if (!interrompidaRef.current) interromper("expirou");
      }
      const espera = retomadaRef.current?.promessa ?? abrirRetomada();
      return Promise.race([espera, new Promise<boolean>((r) => setTimeout(() => r(false), ESPERA_REENTRADA_MS))]);
    });
    return () => registrarReentrada(null);
  }, [interromper, abrirRetomada]);

  // Restore session from Supabase on mount
  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    async function restoreSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user && mounted) {
          await aplicarSessao(session.user, session.access_token);
        }

        // Listen for auth state changes
        //
        // O BUG DO "TROQUEI DE ABA E O SISTEMA TRAVOU" (18/09). Toda vez que a aba volta a ficar
        // visível, o supabase-js roda _recoverAndRefresh() SEGURANDO o lock de autenticação e, de
        // dentro dele, emite SIGNED_IN e ESPERA cada callback terminar. Este callback chamava
        // estadoDuasEtapas() → supabase.auth.mfa.listFactors() → que precisa do MESMO lock → fila
        // circular: o lock espera o callback, o callback espera o lock. A partir daí TODO
        // getSession() da página (todo authedFetch: criar card, anexar, entregar, a própria trilha)
        // fica pendurado até o F5. Entrou em 13/09 com o 2FA; reproduzido no navegador em 18/09
        // (clique em "Criar Conteúdo" após trocar de aba: handler rodou, pedido nunca saiu).
        // Regra (documentada pela Supabase): nada de supabase.auth.* dentro do callback — o trabalho
        // sai para fora do lock com setTimeout(0). E SIGNED_IN repetido para o MESMO usuário já
        // autenticado não faz nada: é a aba voltando, não um login.
        try {
          const { data } = supabase.auth.onAuthStateChange(
            (event, session) => {
              if (!mounted) return;
              if (event === "SIGNED_OUT") {
                const saida = saidaRef.current;
                saidaRef.current = null;
                usuarioAtivoRef.current = null;
                // "Sair" de propósito nesta aba: o logout() já limpou tudo e a tela de login aparece.
                if (saida === "explicita") return;
                // A sessão caiu com a página aberta (inatividade, outra aba saiu, renovação recusada):
                // a página fica guardada por baixo do pedido de senha (25/10/2026, 8.3). Sem ninguém
                // logado antes, segue o caminho antigo (tela de login).
                if (autenticadoRef.current || interrompidaRef.current) {
                  let pelaInatividade = saida === "inatividade";
                  if (!pelaInatividade) {
                    const ultima = lerAtividadeCompartilhada(() => window.localStorage);
                    pelaInatividade = ultima !== null && faseDaInatividade(Date.now(), ultima).fase === "sair";
                  }
                  interromper(pelaInatividade ? "inatividade" : "expirou");
                  return;
                }
                marcarAutenticado(false);
                setCurrentProfileState(DEFAULT_PROFILE);
                return;
              }
              // MFA_CHALLENGE_VERIFIED: outra aba confirmou o código — esta também pode entrar.
              if ((event !== "SIGNED_IN" && event !== "MFA_CHALLENGE_VERIFIED") || !session?.user) return;
              if (usuarioAtivoRef.current === session.user.id) return; // aba voltou; já está logado
              if (entrandoRef.current) return; // login/reentrada desta aba: quem chamou cuida
              const user = session.user;
              setTimeout(() => {
                void (async () => {
                  if (!mounted || usuarioAtivoRef.current === user.id || entrandoRef.current) return;
                  // Outra pessoa entrou em outra aba enquanto esta guardava a página de alguém: a página
                  // é de quem saiu. Recarrega limpo para a pessoa nova (nada de formulário de outro).
                  const interrompida = interrompidaRef.current;
                  if (interrompida && interrompida.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
                    window.location.reload();
                    return;
                  }
                  await aplicarSessao(user);
                })();
              }, 0);
            }
          );
          subscription = data.subscription;
        } catch { /* onAuthStateChange failed */ }
      } catch { /* session restore failed — Supabase unreachable */ }

      if (mounted) setHydrated(true);
    }

    restoreSession();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  // O ouvinte é criado UMA vez (ver acima); tudo o que ele usa é estável (useCallback/ref).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setProfile = useCallback((profile: UserProfile) => {
    setCurrentProfileState(profile);
  }, []);

  const setRole = useCallback((role: Role) => {
    const found = USER_PROFILES.find((p) => p.role === role);
    if (found) setCurrentProfileState(found);
  }, []);

  const setCurrentUser = useCallback((name: string) => {
    const found = USER_PROFILES.find((p) => p.name === name);
    if (found) setCurrentProfileState(found);
  }, []);

  /** Senha → sessão. Usado pelo login e pela reentrada; nunca lança. */
  const entrarComSenha = useCallback(async (email: string, password: string, reentrada: boolean): Promise<ResultadoLogin> => {
    entrandoRef.current = true;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) return falhaDeLogin(error ?? null);
      if (reentrada) {
        // A senha passou no Auth, mas o painel pode continuar recusando (acesso desativado ou removido).
        // Diz isso em vez de abrir a página e cair de novo no primeiro clique.
        const eu = await quemSouEu(data.session.access_token);
        if (eu.status === 401 && !(await estadoDuasEtapas()).precisaCodigo) {
          return { ok: false, motivo: "bloqueado", frase: "A senha está certa, mas o seu acesso ao painel está desativado. Fale com o administrador." };
        }
      }
      const r = await aplicarSessao(data.user, data.session.access_token);
      if (r === "sem-perfil") return { ok: false, motivo: "perfil", frase: fraseDoLogin("perfil") };
      return { ok: true };
    } catch (e) {
      return falhaDeLogin(e as ErroDeLogin);
    } finally {
      entrandoRef.current = false;
    }
  }, [aplicarSessao]);

  const login = useCallback(async (userId: string, password: string): Promise<ResultadoLogin> => {
    // PROCURA NA LISTA VIVA, não na de reserva. Quando a equipe passou a vir do banco, o id de
    // cada perfil mudou (o do Roberto era "roberto" e virou "lonemidiamkt", derivado do e-mail) —
    // e esta busca continuou na lista chumbada. Resultado: o perfil não era encontrado, a função
    // devolvia false ANTES de testar a senha, e a tela dizia "Senha incorreta". Ele ficou de fora
    // com a senha certa na mão, procurando um erro que não existia.
    //
    // Casa por id OU por e-mail: o e-mail é o que não muda quando a forma do id mudar de novo.
    const acha = (lista: UserProfile[]) =>
      lista.find((p) => p.id === userId) ??
      lista.find((p) => p.email.toLowerCase() === userId.toLowerCase());
    const profile = acha(profilesRef.current) ?? acha(USER_PROFILES);
    if (!profile) {
      // Distingue "não achei esse perfil" de "senha errada". Dizer senha incorreta quando o
      // problema é outro manda a pessoa procurar no lugar errado — foi o que aconteceu aqui.
      console.error("[login] perfil não encontrado:", userId);
      return { ok: false, motivo: "perfil", frase: fraseDoLogin("perfil") };
    }
    // 25/10/2026 (8.5): cada falha com o seu motivo — antes toda falha virava "Senha incorreta".
    return entrarComSenha(profile.email, password, false);
  }, [entrarComSenha]);

  const reentrar = useCallback(async (senha: string): Promise<ResultadoLogin> => {
    const alvo = interrompidaRef.current;
    if (!alvo) return { ok: true };
    return entrarComSenha(alvo.email, senha, true);
  }, [entrarComSenha]);

  // "Sair" de propósito. Escopo LOCAL (25/10/2026, 8.3): o padrão do supabase-js é global e derrubava o
  // celular e os outros computadores da pessoa junto. Aqui sai só deste navegador.
  const logout = useCallback(async () => {
    saidaRef.current = "explicita";
    try { await supabase.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
    saidaRef.current = null; // o SIGNED_OUT já passou; o próximo não é deste clique
    usuarioAtivoRef.current = null;
    marcarAutenticado(false);
    setDuasEtapasPendente(false);
    perfilEmEsperaRef.current = null;
    marcarInterrompida(null);
    fecharRetomada(false); // pedidos esperando a reentrada desistem (devolvem o 401)
    setCurrentProfileState(DEFAULT_PROFILE);
  }, [fecharRetomada, marcarAutenticado, marcarInterrompida]);

  const encerrarPorInatividade = useCallback(async () => {
    if (!autenticadoRef.current) return;
    saidaRef.current = "inatividade";
    interromper("inatividade");
    try { await supabase.auth.signOut({ scope: "local" }); } catch { /* a sessão some deste navegador de qualquer jeito */ }
    saidaRef.current = null;
  }, [interromper]);

  const confirmarDuasEtapas = useCallback(async (codigo: string) => {
    entrandoRef.current = true;
    try {
      const r = await verificarCodigo(codigo);
      if (!r.ok) return r;
      const perfil = perfilEmEsperaRef.current;
      perfilEmEsperaRef.current = null;
      setDuasEtapasPendente(false);
      if (perfil) { setCurrentProfileState(perfil); perfilAtualRef.current = perfil; }
      try { const { data } = await supabase.auth.getSession(); usuarioAtivoRef.current = data.session?.user.id ?? null; } catch { /* sem sessão */ }
      marcarAutenticado(true);
      marcarInterrompida(null);
      fecharRetomada(true);
      return { ok: true };
    } finally {
      entrandoRef.current = false;
    }
  }, [fecharRetomada, marcarAutenticado, marcarInterrompida]);

  return (
    <RoleContext.Provider
      value={{
        profiles,
        role: currentProfile.role,
        currentUser: currentProfile.name,
        currentProfile,
        setProfile,
        setRole,
        setCurrentUser,
        roleLabel: ROLE_LABELS[currentProfile.role],
        isAuthenticated,
        hydrated,
        login,
        logout,
        duasEtapasPendente,
        confirmarDuasEtapas,
        sessaoInterrompida,
        reentrar,
        encerrarPorInatividade,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
