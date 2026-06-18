"use client";

import { useState, useEffect, useRef } from "react";
import { useRole, USER_PROFILES } from "@/lib/context/RoleContext";
import { Logo } from "@/components/ui/Logo";
/* eslint-disable @next/next/no-img-element */
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
  const [welcomeState, setWelcomeState] = useState<{
    show: boolean;
    name: string;
    role: string;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
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
        if (profile) {
          setWelcomeState({
            show: true,
            name: profile.name.split(" ")[0],
            role: profile.role,
          });
        }
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

  // Welcome screen auto-dismiss
  useEffect(() => {
    if (welcomeState?.show) {
      const timer = setTimeout(() => setWelcomeState(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [welcomeState]);

  // Welcome overlay
  if (welcomeState?.show) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[200px] pointer-events-none" />
        <div className="text-center animate-fade-in space-y-6 relative z-10">
          <div className="w-20 h-20 rounded-2xl bg-black flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(10,52,245,0.5),0_0_100px_rgba(10,52,245,0.15)]">
            <Logo className="w-12 h-12" priority />
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
              Seja bem-vindo, <span className="text-primary text-glow">{welcomeState.name}</span>
            </h1>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              {WELCOME_MESSAGES[welcomeState.role] ?? "Bem-vindo ao Lone OS."}
            </p>
          </div>
          <div className="flex justify-center">
            <div className="h-0.5 w-32 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-[progress_2.5s_ease-in-out] shadow-[0_0_10px_rgba(10,52,245,0.5)]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[700px] h-[700px] bg-primary/[0.03] rounded-full blur-[200px]" />
        <div className="absolute bottom-[-30%] left-[-15%] w-[500px] h-[500px] bg-primary/[0.02] rounded-full blur-[150px]" />
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
        }} />
      </div>

      {/* Login card */}
      <div className={`relative z-10 w-full max-w-[420px] mx-4 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>

        {/* Logo + Brand */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-xl bg-black flex items-center justify-center mx-auto mb-5 shadow-[0_0_40px_rgba(10,52,245,0.35),0_0_80px_rgba(10,52,245,0.1)]">
            <Logo className="w-8 h-8" priority />
          </div>
          <h1 className="text-lg font-black text-foreground tracking-tight">LONE MÍDIA</h1>
          <p className="text-[10px] text-muted-foreground tracking-[0.25em] uppercase mt-1">Assessoria Digital</p>
        </div>

        {/* Form container */}
        <div className="rounded-2xl border border-border bg-card p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)]">

          {/* Step 1: Select user */}
          {step === "select" && (
            <div className="animate-fade-in space-y-6">
              <div>
                <h2 className="text-xl font-bold text-foreground">Acesse sua conta</h2>
                <p className="text-xs text-muted-foreground mt-1">Selecione seu perfil para continuar</p>
              </div>

              {/* Custom dropdown */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium block">Usuário *</label>
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    onKeyDown={handleKeyDown}
                    className={`w-full bg-card border rounded-xl px-4 py-3.5 text-sm text-left outline-none transition-all flex items-center justify-between ${
                      showDropdown
                        ? "border-primary shadow-[0_0_0_3px_rgba(10,52,245,0.1)]"
                        : "border-border hover:border-border"
                    }`}
                  >
                    {selectedProfile ? (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-primary">{selectedProfile.initials}</span>
                        </div>
                        <div>
                          <p className="text-foreground font-medium text-sm">{selectedProfile.name}</p>
                          <p className="text-muted-foreground text-[10px]">{ROLE_LABELS[selectedProfile.role]}</p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Selecione um usuário...</span>
                    )}
                    <ChevronDown size={16} className={`text-muted-foreground transition-transform ${showDropdown ? "rotate-180" : ""}`} />
                  </button>

                  {/* Dropdown list */}
                  {showDropdown && (
                    <div className="absolute top-full mt-2 left-0 right-0 bg-card border border-border rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.8)] z-50 py-1 animate-fade-in max-h-64 overflow-y-auto">
                      {USER_PROFILES.map((profile) => (
                        <button
                          key={profile.id}
                          onClick={() => handleSelectUser(profile.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-primary/5 ${
                            selectedUser === profile.id ? "bg-primary/[0.03]" : ""
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                            selectedUser === profile.id
                              ? "bg-primary/15 border-primary/30"
                              : "bg-card border-border"
                          }`}>
                            <span className={`text-[10px] font-bold ${
                              selectedUser === profile.id ? "text-primary" : "text-muted-foreground"
                            }`}>{profile.initials}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${selectedUser === profile.id ? "text-primary" : "text-foreground"}`}>
                              {profile.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[profile.role]}</p>
                          </div>
                          {selectedUser === profile.id && (
                            <Check size={14} className="text-primary shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {error && (
                  <p className="text-xs text-destructive animate-fade-in mt-1">{error}</p>
                )}
              </div>

              <button
                onClick={handleContinue}
                disabled={!selectedUser}
                className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-sm font-semibold transition-all disabled:opacity-20 disabled:cursor-not-allowed hover:bg-primary active:scale-[0.99] shadow-[0_0_20px_rgba(10,52,245,0.25),0_4px_14px_rgba(10,52,245,0.2)] flex items-center justify-center gap-2"
              >
                Continuar
                <ArrowRight size={15} />
              </button>
            </div>
          )}

          {/* Step 2: Password */}
          {step === "password" && selectedProfile && (
            <div className="animate-fade-in space-y-6">
              <div>
                <button
                  onClick={handleBack}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 mb-4"
                >
                  <ArrowLeft size={12} />
                  Trocar conta
                </button>

                <h2 className="text-xl font-bold text-foreground">
                  Olá, <span className="text-primary">{selectedProfile.name.split(" ")[0]}</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-1">{ROLE_LABELS[selectedProfile.role]}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium block">Senha *</label>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    onKeyDown={handleKeyDown}
                    placeholder="Digite sua senha"
                    autoComplete="off"
                    className={`w-full bg-card border rounded-xl px-4 py-3.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground ${
                      error
                        ? "border-destructive/50 shadow-[0_0_0_3px_rgba(239,68,68,0.06)]"
                        : "border-border focus:border-primary focus:shadow-[0_0_0_3px_rgba(10,52,245,0.1)]"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {error && (
                  <p className="text-xs text-destructive animate-fade-in">{error}</p>
                )}
              </div>

              <button
                onClick={handleLogin}
                disabled={!password || loading}
                className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-sm font-semibold transition-all disabled:opacity-20 disabled:cursor-not-allowed hover:bg-primary active:scale-[0.99] shadow-[0_0_20px_rgba(10,52,245,0.25),0_4px_14px_rgba(10,52,245,0.2)] flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight size={15} />
                  </>
                )}
              </button>

              <p className="text-[10px] text-muted-foreground text-center">
                Esqueceu a senha? Fale com o administrador.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-muted-foreground text-[9px] uppercase tracking-[0.2em]">
            Lone Mídia Assessoria © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
