'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Star, Download, X,
  Package, RefreshCw, Loader2,
  CheckCircle, Shield, ArrowRight,
  Filter, Grid, LayoutList, Upload, AlertTriangle, Zap, Github, Globe
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import axios from 'axios';
import { API_ENDPOINTS } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

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
  const { t } = useTranslation();
  const canManagePlugins = user?.isAdmin || user?.permissions?.includes('manage_plugins');
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

  return (
    <div className="bg-background min-h-screen text-foreground">
      {/* Premium Red Gradient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-[1000px] h-[1000px] rounded-full blur-[150px] opacity-10 bg-primary/10" />
        <div className="absolute bottom-0 right-1/4 w-[800px] h-[800px] rounded-full blur-[120px] opacity-10 bg-secondary/10" />
      </div>

      {/* Museum Header */}
      <header className="relative pt-12 pb-16 overflow-hidden border-b border-border z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent opacity-50" />
        
        <div className="relative mx-auto max-w-[1400px] px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
            <div className="space-y-4">
              <span className="px-4 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest">
                Plugin Ecosystem
              </span>
              <h1 className="text-5xl md:text-6xl font-black text-foreground tracking-tighter leading-tight">
                {activeTab === 'store' ? 'Plugin Catalog' : 'Active Plugins'}
              </h1>
              <p className="text-lg text-muted-foreground font-medium max-w-xl">
                Explore, manage and optimize your project with premium extensions and modules.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
               <button onClick={fetchData} className="p-4 bg-muted/50 hover:bg-muted border border-border rounded-2xl text-foreground transition-all">
                 <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} />
               </button>
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-black text-lg hover:brightness-110 shadow-lg shadow-primary/20 transition-all"
               >
                 <Upload className="w-5 h-5" /> Import ZIP
               </button>
               <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleSideloadFile(f); e.target.value = ''; }} />
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-4 bg-card/40 backdrop-blur-xl border border-border p-4 rounded-[2rem] shadow-xl">
             <div className="relative flex-1 w-full">
               <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground focus:text-primary transition-colors" />
               <input
                 value={searchQuery}
                 onChange={e => setSearchQuery(e.target.value)}
                 placeholder="Search by name, category or description..."
                 className="w-full h-14 bg-transparent pl-14 pr-12 text-foreground font-bold outline-none placeholder:text-muted-foreground/30 text-lg"
               />
               {searchQuery && (
                 <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                   <X className="w-5 h-5" />
                 </button>
               )}
             </div>
             <div className="flex items-center gap-2 p-1 bg-muted/30 rounded-2xl border border-border/50 shrink-0 overflow-x-auto scrollbar-hide max-w-full">
               <TabButton active={activeTab === 'store'} onClick={() => setActiveTab('store')} icon={Grid} label="Store" />
               <TabButton active={activeTab === 'installed'} onClick={() => setActiveTab('installed')} icon={CheckCircle} label="Local" />
               {canManagePlugins && <TabButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={LayoutList} label="Logs" />}
             </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-8 py-12 relative z-10">
        {/* Feedback Section */}
        <AnimatePresence>
          {sideloadResult && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="mb-8 p-6 bg-green-500/10 border border-green-500/20 rounded-[2rem] flex items-center justify-between text-green-500 shadow-lg shadow-green-500/5">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center font-black">
                   <Zap className="w-6 h-6" />
                 </div>
                 <div>
                    <h3 className="font-black text-lg">{sideloadResult.displayName} v{sideloadResult.version}</h3>
                    <p className="text-sm font-medium opacity-80">{sideloadResult.message}</p>
                 </div>
              </div>
              <button onClick={() => setSideloadResult(null)} className="p-2 hover:bg-green-500/10 rounded-full transition-colors"><X className="w-6 h-6" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Grid */}
        {activeTab === 'logs' ? (
          <div className="space-y-4">
            {pluginLogs.length === 0 ? (
               <div className="py-40 text-center opacity-30 italic text-xl font-bold">No activity logs recorded yet.</div>
            ) : pluginLogs.map(log => (
              <div key={log.id} className="p-6 bg-card border border-border rounded-[2rem] font-mono text-sm group hover:border-primary/30 transition-colors">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-primary font-black uppercase text-xs tracking-widest">{log.pluginName}</span>
                  <span className="text-muted-foreground opacity-50 text-[10px]">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <div className="text-foreground/90 leading-relaxed font-bold">{log.message}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-64 bg-muted/20 animate-pulse rounded-[2.5rem] border border-border/50" />
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
          </div>
        )}
      </main>

      {/* Modern Red Footer */}
      <footer className="border-t border-border bg-card/10 backdrop-blur-xl py-24 px-8 mt-20 relative z-10">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="flex flex-col items-center md:items-start gap-4">
              <div className="flex items-center gap-4">
                <Image src="/Cloud-shakeslogo.png" alt="Shakes" width={32} height={32} className="rounded-xl" />
                <span className="text-2xl font-black tracking-tight tracking-widest uppercase">Shakes Store</span>
              </div>
              <p className="text-sm font-bold text-muted-foreground max-w-xs text-center md:text-left opacity-50 capitalize">The next generation plugin ecosystem for modern creators.</p>
            </div>
            
            <div className="flex items-center gap-12 text-sm font-black uppercase tracking-widest text-muted-foreground/60">
               <a href="https://github.com/errriikkk/Cloud-Shakes" target="_blank" className="hover:text-primary transition-colors">Github</a>
               <a href="https://docs.shakes.es" target="_blank" className="hover:text-primary transition-colors">Documentation</a>
               <div className="relative group/discord cursor-help">
                 <span className="group-hover/discord:opacity-0 transition-opacity duration-300">Discord</span>
                 <span className="absolute inset-0 opacity-0 group-hover/discord:opacity-100 transition-all duration-300 text-primary pointer-events-none whitespace-nowrap translate-y-1 group-hover/discord:translate-y-0 text-[10px]">Próximamente</span>
               </div>
            </div>
          </div>
          
          <div className="mt-20 pt-8 border-t border-border/30 flex flex-col md:flex-row items-center justify-between gap-6">
             <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">© 2026 Cloud Shakes. {t('footerRights')}</p>
             <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest opacity-30">
                <a href="https://shakes.es/privacy" target="_blank" className="hover:opacity-100 transition-opacity">Privacy Policy</a>
                <a href="https://shakes.es/privacy" target="_blank" className="hover:opacity-100 transition-opacity">Terms of Service</a>
             </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button onClick={onClick} className={cn(
      "flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm transition-all",
      active ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105" : "text-muted-foreground hover:text-foreground"
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
      whileHover={{ y: -8, scale: 1.02 }} 
      onClick={onClick}
      className="group cursor-pointer p-8 bg-card border border-border rounded-[2.5rem] shadow-sm hover:shadow-2xl hover:border-primary/30 transition-all duration-500 flex flex-col h-[320px] relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:bg-primary/10 transition-colors" />
      
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground border border-border group-hover:border-primary/30 transition-colors overflow-hidden">
          {plugin.iconUrl ? <img src={plugin.iconUrl} alt="icon" className="w-full h-full object-cover" /> : (plugin.displayName || '?')[0].toUpperCase()}
        </div>
        <div className="mt-4 w-full">
           <h3 className="font-black text-xl text-foreground tracking-tight truncate px-2">{plugin.displayName}</h3>
           <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">by {plugin.author}</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground font-medium line-clamp-3 leading-relaxed mb-auto text-center">{plugin.description}</p>
      
      <div className="flex items-center justify-between pt-6 mt-6 border-t border-border/50">
        <div className="flex items-center gap-3">
          {isInstalled && (
            <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1", 
              hasUpdate ? "bg-amber-500/10 text-amber-500" : "bg-green-500/10 text-green-500"
            )}>
              <span className={cn("w-1.5 h-1.5 rounded-full", hasUpdate ? "bg-amber-500" : "bg-green-500")} /> 
              {hasUpdate ? 'Update' : 'Installed'}
            </span>
          )}
          <span className="text-[10px] font-black font-mono text-muted-foreground/50 uppercase tracking-widest">v{plugin.latestVersion}</span>
        </div>
        <button className="p-3 bg-muted group-hover:bg-primary group-hover:text-primary-foreground rounded-2xl transition-all transform group-hover:rotate-12">
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
