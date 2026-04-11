"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, ShieldAlert, X } from "lucide-react";

type DeniedPayload = { message?: string; permission?: string };

export function GlobalAccessDeniedModal() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<DeniedPayload>({});

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<DeniedPayload>;
      setPayload(custom.detail || {});
      setOpen(true);
    };
    window.addEventListener("permissionDenied", handler as EventListener);
    return () => window.removeEventListener("permissionDenied", handler as EventListener);
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ y: 18, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 18, opacity: 0, scale: 0.98 }}
            className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white text-zinc-900 p-6 shadow-2xl"
          >
            <button onClick={() => setOpen(false)} className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-zinc-100">
              <X className="w-4 h-4" />
            </button>
            <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mb-3">
              <ShieldAlert className="w-6 h-6 text-zinc-800" />
            </div>
            <h3 className="text-lg font-semibold">Access denied</h3>
            <p className="text-sm text-zinc-600 mt-1">
              {payload.message || "No tienes permisos para esta acción."}
            </p>
            {payload.permission ? (
              <div className="mt-3 inline-flex items-center gap-2 text-xs rounded-full bg-zinc-100 border border-zinc-200 px-3 py-1">
                <Lock className="w-3.5 h-3.5" />
                <span>{payload.permission}</span>
              </div>
            ) : null}
            <button onClick={() => setOpen(false)} className="mt-5 w-full rounded-lg bg-zinc-900 text-white text-sm py-2.5 hover:bg-zinc-800 transition-colors">
              Entendido
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
