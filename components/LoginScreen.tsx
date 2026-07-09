"use client";

import { useState, useEffect, useRef } from "react";
import { useRole, USER_PROFILES } from "@/lib/context/RoleContext";
import { Logo } from "@/components/ui/Logo";
import { Eye, EyeOff, ArrowRight, ArrowLeft, ChevronDown, Check, Loader2 } from "lucide-react";

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
  const [step, setStep] = useState<"select" | "password">("select");
  const [showDropdown, setShowDropdown] = useState(false);
  const [welcomeState, setWelcomeState] = useState<{ show: boolean; name: string; role: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Fecha o dropdown ao clicar fora
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
  };

  const handleContinue = () => {
    if (!selectedUser) return;
    setStep("password");
    setError("");
    setTimeout(() => passwordRef.current?.focus(), 100);
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
    if (e.key === "Enter") {
      if (step === "select") handleContinue();
      else void handleLogin();
    }
  };

  const handleBack = () => {
    setStep("select");
    setPassword("");
    setError("");
  };

  // Auto-dismiss da tela de boas-vindas
  useEffect(() => {
    if (welcomeState?.show) {
      const timer = setTimeout(() => setWelcomeState(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [welcomeState]);

  // ─── Boas-vindas ───
  if (welcomeState?.show) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.12] via-transparent to-transparent" />
        <div className="text-center animate-fade-in space-y-6 relative z-10">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl border border-primary/20 bg-primary/[0.08]">
            <Logo className="w-12 h-12" priority />
          </div>
          <div className="space-y-3">
            <h1 className="font-brand text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
              Seja bem-vindo, <span className="text-primary">{welcomeState.name}</span>
            </h1>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              {WELCOME_MESSAGES[welcomeState.role] ?? "Bem-vindo ao Lone OS."}
            </p>
          </div>
          <div className="flex justify-center">
            <div className="h-0.5 w-32 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-[progress_2.5s_ease-in-out]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Login (split-screen) ───
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ── PAINEL DE MARCA (esquerda) ── */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden p-14 bg-gradient-to-br from-primary/[0.16] via-primary/[0.04] to-background">
        {/* Ambiência suave (gradiente, sem neon) */}
        <div className="pointer-events-none absolute -top-40 -right-24 h-[30rem] w-[30rem] rounded-full bg-gradient-to-br from-primary/20 to-transparent blur-[130px]" />
        {/* Anéis concêntricos — profundidade geométrica com borda em token */}
        <div className="pointer-events-none absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2">
          {[600, 440, 290, 160].map((s) => (
            <div key={s} className="absolute rounded-full border border-primary/[0.09]" style={{ width: s, height: s, left: -s / 2, top: -s / 2 }} />
          ))}
        </div>

        {/* Topo: wordmark */}
        <div className="relative z-10 flex items-center gap-2.5">
          <Logo className="w-7 h-7" priority />
          <span className="font-brand text-base font-semibold tracking-tight text-foreground">Lone<span className="text-primary">OS</span></span>
        </div>

        {/* Hero: logo em moldura glass + headline */}
        <div className="relative z-10 flex flex-col items-start gap-9">
          <div className="grid h-36 w-36 place-items-center rounded-[2rem] border border-primary/20 bg-primary/[0.07] backdrop-blur-xl shadow-sm">
            <Logo className="w-[5.5rem] h-[5.5rem]" priority />
          </div>
          <div className="space-y-3 max-w-md">
            <h2 className="font-brand text-[2rem] font-bold leading-[1.15] tracking-tight text-foreground">
              O hub de operação<br />da sua assessoria.
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground max-w-sm">
              Tráfego, social, design e resultados dos clientes — tudo num lugar só, em tempo real.
            </p>
          </div>
        </div>

        {/* Rodapé */}
        <p className="relative z-10 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          Lone Mídia Assessoria © 2026
        </p>
      </div>

      {/* ── PAINEL DO FORM (direita) ── */}
      <div className="flex min-h-screen items-center justify-center p-6 sm:p-10 lg:min-h-0">
        <div className={`w-full max-w-sm transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>

          {/* Marca compacta (só no mobile) */}
          <div className="mb-10 flex flex-col items-center text-center lg:hidden">
            <div className="grid h-14 w-14 place-items-center rounded-xl border border-primary/20 bg-primary/[0.08]">
              <Logo className="w-8 h-8" priority />
            </div>
            <h1 className="mt-4 font-brand text-lg font-bold tracking-tight text-foreground">LONE MÍDIA</h1>
            <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Assessoria Digital</p>
          </div>

          {/* Passo 1: escolher perfil */}
          {step === "select" && (
            <div className="animate-fade-in space-y-7">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Bem-vindo de volta</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">Selecione seu perfil pra entrar no hub.</p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-muted-foreground">Usuário</label>
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    onKeyDown={handleKeyDown}
                    className={`flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3.5 text-left text-sm outline-none transition-all ${
                      showDropdown ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                    }`}
                  >
                    {selectedProfile ? (
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-lg border border-primary/20 bg-primary/10">
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
                    <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition-transform ${showDropdown ? "rotate-180" : ""}`} />
                  </button>

                  {showDropdown && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover py-1.5 shadow-lg animate-fade-in">
                      {USER_PROFILES.map((profile) => {
                        const active = selectedUser === profile.id;
                        return (
                          <button
                            key={profile.id}
                            onClick={() => handleSelectUser(profile.id)}
                            className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-primary/[0.06] ${active ? "bg-primary/[0.05]" : ""}`}
                          >
                            <div className={`grid h-9 w-9 place-items-center rounded-lg border ${active ? "border-primary/30 bg-primary/15" : "border-border bg-card"}`}>
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
                {error && <p className="animate-fade-in text-xs text-destructive">{error}</p>}
              </div>

              <button
                onClick={handleContinue}
                disabled={!selectedUser}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-30"
              >
                Continuar
                <ArrowRight size={15} />
              </button>
            </div>
          )}

          {/* Passo 2: senha */}
          {step === "password" && selectedProfile && (
            <div className="animate-fade-in space-y-7">
              <div>
                <button
                  onClick={handleBack}
                  className="mb-5 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                >
                  <ArrowLeft size={12} /> Trocar conta
                </button>
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl border border-primary/20 bg-primary/10">
                    <span className="text-xs font-semibold text-primary">{selectedProfile.initials}</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">
                      Olá, <span className="text-primary">{selectedProfile.name.split(" ")[0]}</span>
                    </h2>
                    <p className="text-xs text-muted-foreground">{ROLE_LABELS[selectedProfile.role]}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-muted-foreground">Senha</label>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    onKeyDown={handleKeyDown}
                    placeholder="Digite sua senha"
                    autoComplete="off"
                    className={`w-full rounded-xl border bg-card px-4 py-3.5 pr-11 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground ${
                      error ? "border-destructive/50" : "border-border focus:border-primary focus:ring-2 focus:ring-primary/20"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {error && <p className="animate-fade-in text-xs text-destructive">{error}</p>}
              </div>

              <button
                onClick={handleLogin}
                disabled={!password || loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-30"
              >
                {loading ? (<><Loader2 size={15} className="animate-spin" /> Entrando...</>) : (<>Entrar <ArrowRight size={15} /></>)}
              </button>

              <p className="text-center text-[11px] text-muted-foreground">Esqueceu a senha? Fale com o administrador.</p>
            </div>
          )}

          {/* Rodapé (mobile) */}
          <p className="mt-10 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground lg:hidden">
            Lone Mídia Assessoria © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
