'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Star, Download, X,
  Package, RefreshCw, Loader2,
  CheckCircle, Shield, ArrowRight,
  Grid, LayoutList, Upload, AlertTriangle, Zap, ChevronRight, Puzzle, TrendingUp
} from 'lucide-react';
import axios from 'axios';
import { API_ENDPOINTS } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useTranslation } from "@/lib/i18n";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { showPermissionDenied } from '@/lib/permissionFeedback';

const PLUGIN_REGISTRY_URL = process.env.NEXT_PUBLIC_PLUGIN_REGISTRY_URL || 'https://cdn.shakes.es';

interface Plugin {
  name: string;
  displayName: string;
  description: string;
  category: string;
  iconUrl: string | null;
  author: string;
  downloads: number;
  rating: number;
  latestVersion: string;
  status?: string;
  sideloaded?: boolean;
  trustTier?: 'verified' | 'community' | 'internal';
}

interface Category {
  id: string;
  name: string;
  icon: string;
  pluginCount: number;
}

interface InstalledPlugin {
  name: string;
  displayName?: string;
  version?: string;
  currentVersion?: string;
  latestVersion?: string;
  sideloaded?: boolean;
}

interface SideloadResult {
  success: boolean;
  pluginName: string;
  displayName: string;
  version: string;
  message: string;
  activationWarning?: string | null;
}

export default function PluginsPage() {
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const canManagePlugins = user?.isAdmin || user?.permissions?.includes('manage_plugins');

  // Dynamic document title
  const pluginsTitle = useMemo(() => {
    const lang = locale === 'es' ? 'es' : 'en';
    return lang === 'es' ? 'Plugins - Plugins' : 'Plugins - Plugins';
  }, [locale]);
  
  useDocumentTitle(pluginsTitle);
  const router = useRouter();
  
  const [plugins, setPlugins]           = useState<Plugin[]>([]);
  const [categories, setCategories]     = useState<Category[]>([]);
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([]);
  const [pluginLogs, setPluginLogs]     = useState<any[]>([]);
  const [pluginStatus, setPluginStatus] = useState({ configured: true, message: '' });
  const [loading, setLoading]           = useState(true);
  const [logsLoading, setLogsLoading]   = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all');
  const [activeTab, setActiveTab]       = useState<'store' | 'installed' | 'logs'>('store');

  const [sideloadDragging, setSideloadDragging] = useState(false);
  const [sideloadUploading, setSideloadUploading] = useState(false);
  const [sideloadResult, setSideloadResult] = useState<SideloadResult | null>(null);
  const [sideloadError, setSideloadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const localInstalledRes = await axios.get(API_ENDPOINTS.PLUGINS.INSTALLED, {
        headers: { Authorization: `Bearer ${token}` }, withCredentials: true
      }).catch(() => null);
      
      if (localInstalledRes?.data?.plugins) {
        setInstalledPlugins(localInstalledRes.data.plugins);
      }

      try {
        const statusRes = await axios.get(API_ENDPOINTS.PLUGINS.INSTALLED.replace('/installed', '/status'), {
          headers: { Authorization: `Bearer ${token}` }, withCredentials: true
        });
        setPluginStatus({ configured: statusRes.data?.configured !== false, message: statusRes.data?.message || '' });
      } catch { setPluginStatus({ configured: true, message: '' }); }

      const fetchCdn = (path: string) => fetch(`${PLUGIN_REGISTRY_URL}${path}`).then(r => r.json()).catch(() => null);
      const [catsData, allData] = await Promise.all([fetchCdn('/api/plugins/categories'), fetchCdn('/api/plugins')]);
      if (catsData?.categories) setCategories(catsData.categories);
      if (allData?.plugins) setPlugins(allData.plugins);
    } catch (err) { console.error('Data sync failed:', err); }
    finally { setLoading(false); }
  }, [PLUGIN_REGISTRY_URL]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchLogs = async () => {
    if (!canManagePlugins) return;
    setLogsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(API_ENDPOINTS.PLUGINS.LOGS, {
        headers: { Authorization: `Bearer ${token}` }, withCredentials: true,
      });
      setPluginLogs(res.data.logs || []);
    } catch (err) { console.error('Failed to fetch logs:', err); }
    finally { setLogsLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 'logs' && canManagePlugins) fetchLogs();
  }, [activeTab, canManagePlugins]);

  const handleSideloadFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setSideloadError('Only ZIP files are supported');
      return;
    }
    setSideloadError(null);
    setSideloadResult(null);
    setSideloadUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('plugin', file);
      const res = await axios.post(API_ENDPOINTS.PLUGINS.UPLOAD_ZIP, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
        withCredentials: true,
      });
      setSideloadResult(res.data);
      setTimeout(() => fetchData(), 800);
    } catch (err: any) {
      setSideloadError(err?.response?.data?.error || 'Failed to install zip');
    } finally {
      setSideloadUploading(false);
    }
  }, [fetchData]);

  const mergedStorePlugins = useMemo(() => {
    const byName = new Map<string, Plugin>();
    for (const p of plugins) byName.set(p.name, p);
    for (const ip of installedPlugins) {
      if (!byName.has(ip.name)) {
        byName.set(ip.name, {
          name: ip.name,
          displayName: ip.displayName || ip.name,
          description: ip.sideloaded ? 'Manual sideload.' : 'System Local.',
          category: 'utilities',
          iconUrl: null,
          author: ip.sideloaded ? 'Local' : 'System',
          downloads: 0, rating: 0,
          latestVersion: ip.latestVersion || ip.version || ip.currentVersion || 'unknown',
          status: 'installed',
          sideloaded: ip.sideloaded,
        });
      }
    }
    let result = Array.from(byName.values());
    if (searchQuery.trim().length >= 2) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.displayName.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
    }
    if (selectedCategory !== 'all') result = result.filter(p => p.category === selectedCategory);
    return result;
  }, [plugins, installedPlugins, searchQuery, selectedCategory]);

  const getInstalledVersion = (name: string) => {
    const found = installedPlugins.find(p => p.name === name);
    return found ? (found.version || found.currentVersion) : undefined;
  };

  // Stats
  const totalInstalled = installedPlugins.length;
  const totalAvailable = plugins.length;
  const updatesAvailable = installedPlugins.filter(ip => {
    const storePlugin = plugins.find(p => p.name === ip.name);
    return storePlugin && (ip.version || ip.currentVersion) !== storePlugin.latestVersion;
  }).length;

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-6 pb-12">

      {/* ── HEADER ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3">
            <Puzzle className="w-8 h-8 text-primary" />
            {activeTab === 'store' ? 'Plugin Catalog' : activeTab === 'installed' ? 'Active Plugins' : 'Activity Logs'}
          </h1>
          <p className="text-sm text-muted-foreground font-medium mt-1">
            Explore, manage and optimize your project with premium extensions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border/60 hover:bg-muted/50 rounded-xl text-sm font-bold transition-all hover:shadow-sm"
          >
            <RefreshCw className={cn('w-4 h-4 text-primary', loading && 'animate-spin')} />
            {t('common.refresh') || 'Refresh'}
          </button>
          <button
            onClick={() => {
              if (!canManagePlugins) {
                showPermissionDenied('Necesitas permiso para importar plugins ZIP.', 'manage_plugins');
                return;
              }
              fileInputRef.current?.click();
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-sm transition-all",
              canManagePlugins ? "hover:brightness-110" : "opacity-50 cursor-not-allowed"
            )}
          >
            <Upload className="w-4 h-4" /> Import ZIP
          </button>
          <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleSideloadFile(f); e.target.value = ''; }} />
        </div>
      </div>

      {/* ── STATS ROW ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border/40 rounded-3xl px-6 py-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{totalAvailable}</p>
            <p className="text-xs font-medium text-muted-foreground">Available</p>
          </div>
        </div>
        <div className="bg-card border border-border/40 rounded-3xl px-6 py-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500 shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{totalInstalled}</p>
            <p className="text-xs font-medium text-muted-foreground">Installed</p>
          </div>
        </div>
        <div className="bg-card border border-border/40 rounded-3xl px-6 py-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{updatesAvailable}</p>
            <p className="text-xs font-medium text-muted-foreground">Updates</p>
          </div>
        </div>
      </div>

      {/* ── SEARCH + TABS ─────────────────────────── */}
      <div className="bg-card border border-border/40 rounded-3xl p-4 flex flex-col md:flex-row items-center gap-4 hover:shadow-sm transition-shadow">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, category or description..."
            className="w-full h-11 bg-muted/40 border border-border/40 rounded-xl pl-11 pr-10 text-foreground font-medium outline-none placeholder:text-muted-foreground/40 text-sm focus:border-primary/40 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-xl border border-border/40 shrink-0">
          <TabButton active={activeTab === 'store'} onClick={() => setActiveTab('store')} icon={Grid} label="Store" />
          <TabButton active={activeTab === 'installed'} onClick={() => setActiveTab('installed')} icon={CheckCircle} label="Local" />
          <TabButton
            active={activeTab === 'logs'}
            onClick={() => {
              if (!canManagePlugins) {
                showPermissionDenied('No tienes permiso para ver logs de plugins.', 'manage_plugins');
                return;
              }
              setActiveTab('logs');
            }}
            icon={LayoutList}
            label="Logs"
            disabled={!canManagePlugins}
          />
        </div>
      </div>

      {/* ── SIDELOAD FEEDBACK ─────────────────────── */}
      <AnimatePresence>
        {sideloadResult && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 bg-green-500/10 border border-green-500/20 rounded-3xl flex items-center justify-between text-green-600 dark:text-green-400"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base">{sideloadResult.displayName} v{sideloadResult.version}</h3>
                <p className="text-sm font-medium opacity-80">{sideloadResult.message}</p>
              </div>
            </div>
            <button onClick={() => setSideloadResult(null)} className="p-2 hover:bg-green-500/10 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
          </motion.div>
        )}
        {sideloadError && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center justify-between text-red-600 dark:text-red-400"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base">Upload Failed</h3>
                <p className="text-sm font-medium opacity-80">{sideloadError}</p>
              </div>
            </div>
            <button onClick={() => setSideloadError(null)} className="p-2 hover:bg-red-500/10 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CONTENT ────────────────────────────────── */}
      {activeTab === 'logs' ? (
        <div className="bg-card border border-border/40 rounded-3xl p-6 hover:shadow-sm transition-shadow">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <LayoutList className="w-5 h-5 text-orange-500" />
              <span className="font-bold text-base text-foreground">Activity Logs</span>
            </div>
          </div>
          <div className="space-y-3">
            {logsLoading ? (
              <div className="py-16 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : pluginLogs.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <LayoutList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No activity logs recorded yet.</p>
              </div>
            ) : pluginLogs.map(log => (
              <div key={log.id} className="flex items-start gap-4 px-4 py-3.5 rounded-2xl border border-border/40 hover:bg-muted/40 transition-colors group">
                <div className="relative mt-1.5 flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-primary/50 ring-4 ring-background z-10" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-bold text-primary">{log.pluginName}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-foreground/80 mt-1">{log.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-56 bg-muted/30 animate-pulse rounded-3xl border border-border/40" />
            ))
          ) : (
            (activeTab === 'store' ? mergedStorePlugins : installedPlugins.map(ip => mergedStorePlugins.find(p => p.name === ip.name) || ip as any)).map((plugin, idx) => {
              if (!plugin || !plugin.name) return null;
              const installedVer = getInstalledVersion(plugin.name);
              return (
                <FeatureCard
                  key={plugin.name + idx}
                  plugin={plugin}
                  isInstalled={!!installedVer}
                  installedVer={installedVer}
                  onClick={() => router.push(`/dashboard/plugins/${plugin.name}`)}
                />
              );
            })
          )}
          {!loading && mergedStorePlugins.length === 0 && activeTab === 'store' && (
            <div className="col-span-full py-16 text-center text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No plugins found.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, disabled = false }: { active: boolean; onClick: () => void; icon: any; label: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} className={cn(
      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
      active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
      disabled && "opacity-50"
    )}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

function FeatureCard({ plugin, isInstalled, installedVer, onClick }: { plugin: Plugin; isInstalled: boolean; installedVer?: string; onClick: () => void }) {
  const { t } = useTranslation();
  const hasUpdate = isInstalled && installedVer && plugin.latestVersion && installedVer !== plugin.latestVersion;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }} 
      onClick={onClick}
      className="group cursor-pointer bg-card border border-border/40 rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300 flex flex-col h-[260px] relative overflow-hidden"
    >
      {/* Subtle corner glow on hover */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground border border-border/50 group-hover:border-primary/30 transition-colors overflow-hidden shrink-0 text-lg font-bold">
          {plugin.iconUrl ? <img src={plugin.iconUrl} alt="icon" className="w-full h-full object-cover" /> : (plugin.displayName || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base text-foreground tracking-tight truncate group-hover:text-primary transition-colors">{plugin.displayName}</h3>
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">by {plugin.author}</p>
            {plugin.trustTier ? (
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                plugin.trustTier === "verified" ? "bg-emerald-500/10 text-emerald-600" :
                plugin.trustTier === "internal" ? "bg-blue-500/10 text-blue-600" :
                "bg-muted text-muted-foreground"
              )}>
                {plugin.trustTier}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground font-medium line-clamp-3 leading-relaxed mb-auto">{plugin.description}</p>
      
      <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/40">
        <div className="flex items-center gap-2">
          {isInstalled && (
            <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5", 
              hasUpdate ? "bg-amber-500/10 text-amber-500" : "bg-green-500/10 text-green-500"
            )}>
              <span className={cn("w-1.5 h-1.5 rounded-full", hasUpdate ? "bg-amber-500" : "bg-green-500")} /> 
              {hasUpdate ? 'Update' : 'Installed'}
            </span>
          )}
          <span className="text-[10px] font-bold font-mono text-muted-foreground/50 uppercase">v{plugin.latestVersion}</span>
        </div>
        <div className="w-8 h-8 rounded-xl bg-muted/60 group-hover:bg-primary group-hover:text-primary-foreground flex items-center justify-center transition-all">
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </motion.div>
  );
}
