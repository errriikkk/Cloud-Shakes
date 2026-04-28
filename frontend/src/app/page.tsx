"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Cloud, ArrowRight, Lock, Fingerprint, Info, ArrowLeft } from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { API_ENDPOINTS } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useBranding } from "@/lib/branding";
import { BuiltWithBadge } from "@/components/BuiltWithBadge";

function LoginContent() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorMessage, setTwoFactorMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale, setLocale } = useTranslation();
  const { cloudName, logoUrl } = useBranding();
  const redirectTo = searchParams.get("redirect");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setTwoFactorMessage("");

    try {
      await axios.post(API_ENDPOINTS.AUTH.LOGIN, {
        username,
        password,
        otp: requiresTwoFactor ? otp.trim() : undefined,
      }, {
        withCredentials: true
      });
      router.push(redirectTo || "/dashboard");
    } catch (err: any) {
      if (err.response?.status === 401 && err.response?.data?.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setOtp("");
        setTwoFactorMessage("Verificacion en dos pasos activada. Introduce tu codigo OTP para continuar.");
        return;
      }
      if (err.response?.status === 429) {
        const retryAfter = err.response.headers['retry-after'];
        const resetTime = err.response.headers['ratelimit-reset'];

        let message = t("auth.tooManyAttempts");

        if (retryAfter) {
          const seconds = parseInt(retryAfter);
          if (!isNaN(seconds)) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            message = t("auth.tooManyRequests").replace("{time}", `${mins > 0 ? `${mins}m ` : ""}${secs}s`);
          }
        } else if (resetTime) {
          message = t("auth.waitBeforeRetry");
        }
        setError(message);
      } else {
        setError(err.response?.data?.message || t("auth.authFailed"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#fdfdfc] p-4 font-sans selection:bg-primary/10 selection:text-primary">
      <div className="w-full max-w-md">
        {/* Minimal language toggle */}
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={() => setLocale(locale === "es" ? "en" : "es")}
            className="px-3 py-1.5 rounded-full border border-border/60 bg-background/80 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            title="Language"
          >
            {locale === "es" ? "ES" : "EN"}
          </button>
        </div>
        {/* Logo & Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-primary/10 overflow-hidden">
            <img src={logoUrl || "/logo-512.png"} alt={cloudName} className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tightest">
            {cloudName}
          </h1>
          <p className="text-muted-foreground/40 text-[10px] font-bold uppercase tracking-widest">
            {t("auth.privateInfrastructure")} &copy; {new Date().getFullYear()}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-background border border-border/60 rounded-[2.5rem] shadow-2xl shadow-black/[0.03] p-10">
          <form onSubmit={handleLogin} className="space-y-6">
            {!requiresTwoFactor && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-1">{t("auth.username")}</label>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("auth.userPlaceholder")}
                  className="bg-muted/40 border-border/60 rounded-2xl h-12 px-5 focus:bg-background transition-all"
                  autoComplete="username"
                />
              </div>
            )}

            {!requiresTwoFactor && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-1">{t("auth.password")}</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                  className="bg-muted/40 border-border/60 rounded-2xl h-12 px-5 focus:bg-background transition-all"
                  autoComplete="current-password"
                />
              </div>
            )}

            <AnimatePresence>
              {requiresTwoFactor && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="space-y-2"
                >
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-1">
                    2FA / OTP
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className="bg-muted/40 border-border/60 rounded-2xl h-12 px-5 focus:bg-background transition-all tracking-[0.35em] text-center"
                    autoComplete="one-time-code"
                  />
                  <p className="text-[11px] text-muted-foreground px-1">
                    Introduce el codigo de 6 digitos de tu app autenticadora.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 rounded-xl px-3 text-xs"
                    onClick={() => {
                      setRequiresTwoFactor(false);
                      setOtp("");
                      setError("");
                      setTwoFactorMessage("");
                    }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {twoFactorMessage && requiresTwoFactor && !error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-amber-700 text-[13px] bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-3 font-medium"
                >
                  <Info className="w-4 h-4 flex-shrink-0" />
                  {twoFactorMessage}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-600 text-[13px] bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 font-medium"
                >
                  <Info className="w-4 h-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              className="w-full h-12 rounded-2xl bg-primary text-white hover:opacity-90 font-bold shadow-xl shadow-primary/10 transition-all active:scale-[0.98]"
              disabled={loading || !username || !password || (requiresTwoFactor && otp.trim().length !== 6)}
              isLoading={loading}
            >
              {loading ? t("auth.loggingIn") : (requiresTwoFactor ? "Verificar codigo" : t("auth.loginNow"))}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-12 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 rounded-full border border-border/40">
            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t("auth.endToEndEncrypted")}</span>
          </div>
          <BuiltWithBadge className="justify-center" />
          <p className="text-[11px] text-muted-foreground/60 font-medium">
            &copy; {new Date().getFullYear()} {cloudName}. {t("auth.allRightsReserved")}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
