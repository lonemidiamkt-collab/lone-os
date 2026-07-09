"use client";

import { useState, useEffect, useRef } from "react";
import { useRole, USER_PROFILES } from "@/lib/context/RoleContext";
import { Logo } from "@/components/ui/Logo";
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
  const { login } = useRole();
  const [selectedUser, setSelectedUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [welcomeState, setWelcomeState] = useState<{ show: boolean; name: string; role: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedProfile = USER_PROFILES.find((p) => p.id === selectedUser);

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
      } else {
        const profile = USER_PROFILES.find((p) => p.id === selectedUser);
        if (profile) setWelcomeState({ show: true, name: profile.name.split(" ")[0], role: profile.role });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("fetch") || msg.includes("network") || msg.includes("timeout")) {
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
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
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
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Vídeo de fundo — full-bleed em qualquer tela (mobile → ultrawide) */}
      <video className="pointer-events-none absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline aria-hidden>
        <source src="/login-video.mp4" type="video/mp4" />
      </video>
      {/* Nossa coloração (mix-blend pro primary) + scrim uniforme de legibilidade sobre o vídeo. */}
      <div className="pointer-events-none absolute inset-0 bg-primary opacity-40 mix-blend-color" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/70 via-background/25 to-background/55" />

      {/* Conteúdo: coluna no mobile, split no desktop. Card SEMPRE centralizado e com largura
          MÁXIMA — some a faixa lateral do mobile e o esticão do ultrawide. */}
      <div className="relative z-10 flex min-h-screen flex-col p-4 sm:p-6 lg:flex-row lg:items-center lg:gap-6 lg:p-10">
        {/* HEADER: topo no mobile, esquerda no desktop */}
        <header className="flex items-center gap-2.5 px-1 py-2 lg:flex-1 lg:px-6">
          <Logo className="h-9 w-9" priority />
          <span className="font-brand text-base font-semibold tracking-tight text-foreground">Lone Mídia Assessoria</span>
        </header>

        {/* CARD: centralizado vertical, largura limitada */}
        <div className="flex flex-1 items-center justify-center lg:flex-none">
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

        {/* Form — usuário + senha na MESMA tela */}
        <div className="animate-fade-in space-y-6">
          <div>
            <h1 className="font-brand text-3xl font-bold leading-tight tracking-tight text-foreground">Bem-vindo de volta</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">Selecione seu perfil e entre no hub.</p>
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
                    <div className="grid h-9 w-9 place-items-center rounded-lg border border-primary/20 bg-primary/15">
                      <span className="text-[11px] font-semibold text-primary">{selectedProfile.initials}</span>
                    </div>
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
                  {USER_PROFILES.map((profile) => {
                    const active = selectedUser === profile.id;
                    return (
                      <button
                        key={profile.id}
                        onClick={() => handleSelectUser(profile.id)}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent ${active ? "bg-primary/10" : ""}`}
                      >
                        <div className={`grid h-9 w-9 place-items-center rounded-lg border ${active ? "border-primary/30 bg-primary/15" : "border-border bg-secondary"}`}>
                          <span className={`text-[11px] font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}>{profile.initials}</span>
                        </div>
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

        {/* Rodapé */}
        <p className="text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          Lone Mídia Assessoria © 2026
        </p>
          </section>
        </div>
      </div>
    </div>
  );
}
