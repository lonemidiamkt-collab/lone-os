"use client";

import { useState, useEffect, useRef } from "react";
import { useRole } from "@/lib/context/RoleContext";
import { Logo } from "@/components/ui/Logo";
import { fotoDaPessoa } from "@/lib/equipe/fotos";
import { Eye, EyeOff, ArrowRight, ChevronDown, Check, Loader2 } from "lucide-react";

// Login: vídeo de fundo (handoff LoneHub) + card. Regras da Lone PRESERVADAS: fonte Montserrat,
// auth por seletor de perfil + senha (numa tela só), marca Lone Mídia, e CORES do design system
// interno (card/secondary/input/border/primary — navy), não o vidro branco.

const WELCOME_MESSAGES: Record<string, string> = {
  admin: "Tudo sob controle.",
  manager: "Vamos organizar o dia.",
  traffic: "Bora otimizar campanhas.",
  social: "Hora de criar conteúdo.",
  designer: "Pronto pra dar vida às ideias.",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "CEO",
  manager: "Gerente de Operações",
  traffic: "Gestor de Tráfego",
  social: "Social Media",
  designer: "Designer",
};

export default function LoginScreen() {
  const { login, profiles, duasEtapasPendente, confirmarDuasEtapas, logout } = useRole();
  const [selectedUser, setSelectedUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [welcomeState, setWelcomeState] = useState<{ show: boolean; name: string; role: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Segunda etapa: senha passou, a conta tem autenticador, falta o código de 6 dígitos.
  const [codigo, setCodigo] = useState("");
  const [erroCodigo, setErroCodigo] = useState("");
  const [verificando, setVerificando] = useState(false);
  const codigoRef = useRef<HTMLInputElement>(null);
  const duasEtapasPendenteRef = useRef(false);
  useEffect(() => { duasEtapasPendenteRef.current = duasEtapasPendente; if (duasEtapasPendente) setTimeout(() => codigoRef.current?.focus(), 60); }, [duasEtapasPendente]);

  const handleCodigo = async () => {
    if (codigo.replace(/\D/g, "").length !== 6 || verificando) return;
    setVerificando(true);
    setErroCodigo("");
    const r = await confirmarDuasEtapas(codigo);
    setVerificando(false);
    if (!r.ok) { setErroCodigo(r.erro ?? "Código inválido."); setCodigo(""); return; }
    const profile = profiles.find((p) => p.id === selectedUser);
    if (profile) setWelcomeState({ show: true, name: profile.name.split(" ")[0], role: profile.role });
  };
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedProfile = profiles.find((p) => p.id === selectedUser);

  const handleSelectUser = (userId: string) => {
    setSelectedUser(userId);
    setShowDropdown(false);
    setError("");
    // Foca a senha na hora — tudo na mesma tela
    setTimeout(() => passwordRef.current?.focus(), 60);
  };

  const handleLogin = async () => {
    if (!selectedUser || !password || loading) return;
    setLoading(true);
    setError("");
    try {
      const success = await login(selectedUser, password);
      if (!success) {
        setError("Senha incorreta. Verifique e tente novamente.");
        setPassword("");
      } else if (!duasEtapasPendenteRef.current) {
        const profile = profiles.find((p) => p.id === selectedUser);
        if (profile) setWelcomeState({ show: true, name: profile.name.split(" ")[0], role: profile.role });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("perfil-nao-encontrado")) {
        // Não é senha. Falar "senha incorreta" aqui faz a pessoa trocar a senha à toa.
        setError("Não encontrei esse perfil no sistema. Recarregue a página — se persistir, é falha nossa, me avise.");
        setPassword("");
      } else if (msg.includes("fetch") || msg.includes("network") || msg.includes("timeout")) {
        setError("Sem conexão com o servidor. O sistema funcionará em modo local.");
      } else {
        setError("Erro inesperado. Tente novamente em instantes.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void handleLogin();
  };

  useEffect(() => {
    if (welcomeState?.show) {
      const timer = setTimeout(() => setWelcomeState(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [welcomeState]);

  // ─── Boas-vindas ───
  if (welcomeState?.show) {
    return (
      <div className="tema-escuro relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
        <video className="absolute inset-0 h-full w-full object-cover opacity-60" autoPlay muted loop playsInline aria-hidden>
          <source src="/login-video.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-background/50" />
        <div className="relative z-10 space-y-6 text-center animate-fade-in">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl border border-border bg-card/80 backdrop-blur-xl">
            <Logo className="h-12 w-12" priority />
          </div>
          <div className="space-y-3">
            <h1 className="font-brand text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Seja bem-vindo, <span className="text-primary">{welcomeState.name}</span>
            </h1>
            <p className="mx-auto max-w-xs text-sm text-muted-foreground">
              {WELCOME_MESSAGES[welcomeState.role] ?? "Bem-vindo ao Lone OS."}
            </p>
          </div>
          <div className="flex justify-center">
            <div className="h-0.5 w-32 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary animate-[progress_2.5s_ease-in-out]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const canLogin = !!selectedUser && !!password && !loading;

  // ─── Login (vídeo de fundo + card) ───
  return (
    // Login é momento de marca: sempre na paleta escura (.tema-escuro), qualquer que seja o tema
    // escolhido — no claro o vídeo ficava lavado e o botão desabilitado parecia lilás.
    <div className="tema-escuro relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Vídeo full-bleed SÓ no desktop — o render é paisagem e crop mal em tela vertical. No mobile
          a logo aparece num quadrado no topo (hero), inteira e sem crop torto. */}
      <video className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover object-center lg:block" autoPlay muted loop playsInline aria-hidden>
        <source src="/login-video.mp4" type="video/mp4" />
      </video>
      <div className="pointer-events-none absolute inset-0 hidden bg-primary opacity-40 mix-blend-color lg:block" />
      {/* Escurecimento do vídeo, mais forte à direita (lado do card) pro texto ter contraste. */}
      <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-background/30 via-background/45 to-background/80 lg:block" />
      {/* Mobile: gradiente da marca (o vídeo é só desktop). */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.1] via-background to-background lg:hidden" />

      {/* Marca no canto superior esquerdo — fixa, fora do fluxo, pra NÃO sobrepor o logo do vídeo. */}
      <header className="absolute left-5 top-5 z-20 flex items-center gap-2.5 sm:left-8 sm:top-7">
        <Logo className="h-8 w-8" priority />
        <span className="font-brand text-base font-semibold tracking-tight text-foreground">Lone Mídia Assessoria</span>
      </header>

      {/* Card: centralizado no mobile; encostado à direita no desktop (o logo do vídeo fica visível
          à esquerda). max-w-md + padding lateral responsivo — nada de esticar/colar na borda. */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-24 sm:px-6 lg:justify-end lg:py-10 lg:pr-[7vw]">
          <section
            className={`flex w-full max-w-md flex-col gap-6 rounded-3xl border border-border bg-card/85 p-6 shadow-2xl backdrop-blur-2xl transition-all duration-700 sm:gap-7 sm:p-8 lg:p-12 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
        {/* Marca: logo (PNG) + nome */}
        <div className="flex items-center gap-3">
          <Logo className="h-11 w-11" priority />
          <p className="font-brand text-xl font-bold tracking-tight text-foreground">Lone OS</p>
        </div>

        {duasEtapasPendente ? (
        /* Segunda etapa — código do autenticador. A senha já passou; a sessão está em aal1 e o
           servidor não aceita nada de quem tem autenticador até subir para aal2. */
        <div className="animate-fade-in space-y-6">
          <div>
            <h1 className="font-brand text-3xl font-bold leading-tight tracking-tight text-foreground">Confirme que é você</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">Digite o código de 6 dígitos do seu aplicativo autenticador.</p>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">Código</label>
            <input
              ref={codigoRef}
              id="codigo-duas-etapas"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6)); setErroCodigo(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCodigo(); }}
              placeholder="000000"
              className={`h-[54px] w-full rounded-xl border bg-secondary px-4 text-center font-mono text-2xl tracking-[0.5em] text-foreground outline-none transition-all placeholder:text-muted-foreground ${
                erroCodigo ? "border-destructive/60 animate-shake" : "border-input focus:border-primary focus:ring-2 focus:ring-primary/20"
              }`}
            />
            {erroCodigo && <p className="animate-fade-in text-sm text-destructive">{erroCodigo}</p>}
          </div>
          <button
            onClick={handleCodigo}
            disabled={codigo.length !== 6 || verificando}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold uppercase tracking-[0.08em] text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-2xl hover:shadow-primary/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {verificando ? (<><Loader2 size={16} className="animate-spin" /> Conferindo...</>) : (<>Confirmar <ArrowRight size={16} /></>)}
          </button>
          <button type="button" onClick={() => void logout()} className="w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground">
            Voltar e entrar com outra conta
          </button>
        </div>
        ) : (
        /* Form — usuário + senha na MESMA tela */
        <div className="animate-fade-in space-y-6">
          <div>
            <h1 className="font-brand text-3xl font-bold leading-tight tracking-tight text-foreground">Bem-vindo de volta</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">Selecione seu perfil e entre no Lone OS.</p>
          </div>

          {/* Usuário */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">Usuário</label>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className={`flex h-[54px] w-full items-center justify-between rounded-xl border bg-secondary px-4 text-left text-[15px] outline-none transition-all ${
                  showDropdown ? "border-primary ring-2 ring-primary/20" : "border-input hover:border-primary/40"
                }`}
              >
                {selectedProfile ? (
                  <div className="flex items-center gap-3">
                    <AvatarLogin name={selectedProfile.name} initials={selectedProfile.initials} active />
                    <div>
                      <p className="text-sm font-medium text-foreground">{selectedProfile.name}</p>
                      <p className="text-[11px] text-muted-foreground">{ROLE_LABELS[selectedProfile.role]}</p>
                    </div>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Selecione um usuário...</span>
                )}
                <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform ${showDropdown ? "rotate-180" : ""}`} />
              </button>

              {showDropdown && (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-60 overflow-y-auto rounded-xl border border-border bg-popover py-1.5 shadow-2xl animate-fade-in">
                  {profiles.map((profile) => {
                    const active = selectedUser === profile.id;
                    return (
                      <button
                        key={profile.id}
                        onClick={() => handleSelectUser(profile.id)}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent ${active ? "bg-primary/10" : ""}`}
                      >
                        <AvatarLogin name={profile.name} initials={profile.initials} active={active} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${active ? "text-primary" : "text-foreground"}`}>{profile.name}</p>
                          <p className="text-[11px] text-muted-foreground">{ROLE_LABELS[profile.role]}</p>
                        </div>
                        {active && <Check size={15} className="shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Senha — sempre visível, na mesma tela */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">Senha</label>
            <div className="relative flex items-center">
              <input
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                placeholder="Sua senha"
                autoComplete="off"
                className={`h-[54px] w-full rounded-xl border bg-secondary px-4 pr-12 text-[15px] text-foreground outline-none transition-all placeholder:text-muted-foreground ${
                  error ? "border-destructive/60 animate-shake" : "border-input focus:border-primary focus:ring-2 focus:ring-primary/20"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {error && <p className="animate-fade-in text-sm text-destructive">{error}</p>}
          </div>

          <button
            onClick={handleLogin}
            disabled={!canLogin}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold uppercase tracking-[0.08em] text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-2xl hover:shadow-primary/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (<><Loader2 size={16} className="animate-spin" /> Entrando...</>) : (<>Entrar <ArrowRight size={16} /></>)}
          </button>

          <p className="text-center text-xs text-muted-foreground">Esqueceu a senha? Fale com o administrador.</p>
        </div>
        )}

        {/* Rodapé */}
        <p className="text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          Lone Mídia Assessoria © 2026
        </p>
          </section>
      </div>
    </div>
  );
}

// Foto do time quando existe (public/equipe); senão, as iniciais de sempre.
function AvatarLogin({ name, initials, active }: { name: string; initials: string; active?: boolean }) {
  const foto = fotoDaPessoa(name);
  if (foto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={foto}
        alt=""
        width={36}
        height={36}
        className={`h-9 w-9 shrink-0 rounded-full object-cover ring-2 ${active ? "ring-primary" : "ring-border"}`}
      />
    );
  }
  return (
    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${active ? "border-primary/30 bg-primary/15" : "border-border bg-secondary"}`}>
      <span className={`text-[11px] font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}>{initials}</span>
    </div>
  );
}
