"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Cloud, ArrowRight, Lock, Fingerprint, Info } from "lucide-react";
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

    try {
      await axios.post(API_ENDPOINTS.AUTH.LOGIN, {
        username,
        password,
      }, {
        withCredentials: true
      });
      router.push(redirectTo || "/dashboard");
    } catch (err: any) {
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
              disabled={loading || !username || !password}
              isLoading={loading}
            >
              {loading ? t("auth.loggingIn") : t("auth.loginNow")}
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
