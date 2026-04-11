'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Star, Download, ExternalLink, Shield,
  RefreshCw, Trash2, AlertTriangle, Globe, Code2, Tag, Clock, Package,
  User, CheckCircle, Zap, Loader2, ArrowRight, Github, MessageSquare
} from 'lucide-react';
import { API_ENDPOINTS } from '@/lib/api';
import axios from 'axios';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/lib/i18n';

const PLUGIN_REGISTRY_URL = process.env.NEXT_PUBLIC_PLUGIN_REGISTRY_URL || 'https://cdn.shakes.es';

async function activatePluginLocally(pluginName: string, version: string) {
  const token = localStorage.getItem('token');
  try {
     await axios.post(
       API_ENDPOINTS.PLUGINS.INSTALL,
       { pluginName, version, capabilities: [], config: {} },
       { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
     );
     return { ok: true as const };
  } catch (error: any) {
     return { ok: false as const, error: error?.response?.data?.error || error.message || 'Error occurred during activation' };
  }
}

async function uninstallPluginLocally(pluginName: string) {
  const token = localStorage.getItem('token');
  await axios.post(API_ENDPOINTS.PLUGINS.UNINSTALL, { pluginName }, { headers: { Authorization: `Bearer ${token}` }, withCredentials: true });
}

function getInstanceId(): string | null {
  if (typeof window === 'undefined') return null;
  let instanceId = localStorage.getItem('instance_id');
  if (!instanceId) {
    instanceId = `inst_${crypto.randomUUID().replace(/-/g, '')}`;
    localStorage.setItem('instance_id', instanceId);
  }
  return instanceId;
}

export default function PluginDetailPage() {
  const params  = useParams();
  const router  = useRouter();
  const { t }    = useTranslation();
  const name    = params?.name as string;

  const [plugin, setPlugin]     = useState<any | null>(null);
  const [loading, setLoading]   = useState(true);
  const [installState, setInstallState] = useState<'idle' | 'installing' | 'installed'>('idle');
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [showUninstall, setShowUninstall] = useState(false);
  const [activeTab, setActiveTab] = useState<'about' | 'changelog'>('about');
  const [pageUi, setPageUi] = useState<{ html: string; styles?: string } | null>(null);

  const fetchPlugin = useCallback(async (n: string) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      try {
        const localInstalled = await axios.get(API_ENDPOINTS.PLUGINS.INSTALLED, { headers: { Authorization: `Bearer ${token}` }, withCredentials: true });
        if (localInstalled.status === 200) {
          const localPlugin = (localInstalled.data.plugins || []).find((p: any) => p.name === n);
          if (localPlugin) {
             setInstallState('installed');
             setCurrentVersion(localPlugin.currentVersion || localPlugin.version);
             
             setPlugin({
                name: localPlugin.name,
                displayName: localPlugin.displayName || localPlugin.name,
                description: 'Instalado localmente. Cargando más datos...',
                category: 'utilities',
                iconUrl: null,
                author: 'Local',
                downloads: 0,
                rating: 0,
                latestVersion: localPlugin.version || '1.0.0',
                pricing: null,
                tags: ['local'],
                screenshots: [],
                versions: [],
                recentReviews: []
             });

             if (localPlugin.isActive && localPlugin.slots?.includes('page')) {
               const pageRes = await axios.get(API_ENDPOINTS.PLUGINS.PAGE(n), { headers: { Authorization: `Bearer ${token}` }, withCredentials: true });
               if (pageRes.status === 200) setPageUi(pageRes.data);
             }
          }
        }
      } catch (err) {}

      const res = await fetch(`${PLUGIN_REGISTRY_URL}/api/plugins/${n}`).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        setPlugin(data);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [PLUGIN_REGISTRY_URL]);

  useEffect(() => { if (name) fetchPlugin(name); }, [name, fetchPlugin]);

  const handleInstall = async () => {
    if (installState === 'installed') { setShowUninstall(true); return; }
    setInstallState('installing');
    try {
      const version = plugin?.versions?.[0]?.version || plugin?.latestVersion || '1.0.0';
      const instanceId = getInstanceId();
      if (!instanceId) throw new Error('No instance id available');
      await fetch(`${PLUGIN_REGISTRY_URL}/api/plugins/i/${instanceId}/install`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pluginName: name, version }) }).catch(() => {});
      
      const localActivation = await activatePluginLocally(name, version);
      if (localActivation.ok) {
        setInstallState('installed');
        setCurrentVersion(version);
      } else throw new Error(localActivation.error);
    } catch (err: any) { setInstallState('idle'); }
  };

  const handleUninstall = async () => {
    try {
      const instanceId = getInstanceId();
      if (instanceId) {
          await fetch(`${PLUGIN_REGISTRY_URL}/api/plugins/i/${instanceId}/uninstall?pluginName=${encodeURIComponent(name)}`, { method: 'DELETE' }).catch(() => {});
      }
      await uninstallPluginLocally(name);
      setInstallState('idle');
      setCurrentVersion(null);
      setShowUninstall(false);
    } catch (err: any) {}
  };

  const handleUpdate = async () => {
    if (!plugin?.latestVersion) return;
    setInstallState('installing');
    try {
      const targetVersion = plugin.latestVersion;
      const instanceId = getInstanceId();
      if (instanceId) {
          await fetch(`${PLUGIN_REGISTRY_URL}/api/plugins/i/${instanceId}/install`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pluginName: name, version: targetVersion }) }).catch(() => {});
      }
      const localActivation = await activatePluginLocally(name, targetVersion);
      if (localActivation.ok) setCurrentVersion(targetVersion);
      else throw new Error(localActivation.error);
    } catch (err: any) {} 
    finally { setInstallState('installed'); }
  };

  if (loading) return (
    <div className="flex flex-col h-[60vh] items-center justify-center space-y-4">
      <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
      <span className="text-sm font-medium text-muted-foreground">{t('common.loading')}</span>
    </div>
  );

  if (!plugin) return (
    <div className="flex flex-col h-[60vh] items-center justify-center p-8 text-center space-y-5">
      <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center shadow-inner">
         <Package className="w-10 h-10 text-muted-foreground/60" />
      </div>
      <div>
         <h2 className="text-xl font-bold text-foreground mb-2">{t('plugins.pluginLostTitle')}</h2>
         <p className="text-muted-foreground text-sm max-w-sm">{t('plugins.pluginLostDesc')}</p>
      </div>
      <Button onClick={() => router.push('/dashboard/plugins')} variant="default"><ArrowLeft className="w-4 h-4 mr-2"/> {t('plugins.backToMarketplace')}</Button>
    </div>
  );

  const latestVer = plugin.versions?.[0] || { version: plugin.latestVersion };
  const isInstalled = installState === 'installed';
  const isInstalling = installState === 'installing';
  const canInstallByStatus = !plugin.status || plugin.status.toLowerCase() === 'approved' || plugin.status === 'installed-hidden';
  const hasUpdate = !!(isInstalled && currentVersion && latestVer?.version && currentVersion !== latestVer.version);

  if (pageUi) {
    const iframeSrcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #333; background: transparent; } @media (prefers-color-scheme: dark) { body { color: #f9f9f9; } } ${pageUi.styles || ''}</style><script>window.cloudLocal={invoke:function(action,payload){window.parent.postMessage({type:'PLUGIN_ACTION',plugin:'${name}',action,payload},'*')}};</script></head><body>${pageUi.html}</body></html>`;
    return (
      <div className="-mx-4 md:-mx-8 -my-4 md:-my-8 w-[calc(100%+2rem)] md:w-[calc(100%+4rem)] h-[calc(100vh-theme(spacing.12))] overflow-hidden flex flex-col bg-background relative z-50">
        <div className="h-14 border-b border-border bg-card px-4 flex items-center justify-between shrink-0 shadow-sm z-10">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-muted flex items-center justify-center font-bold text-sm text-foreground overflow-hidden border border-border">
                {plugin.iconUrl ? <img src={plugin.iconUrl} alt={plugin.displayName} className="w-full h-full object-cover" /> : plugin.displayName?.charAt(0).toUpperCase()}
              </div>
              <span className="font-semibold text-foreground text-sm">{plugin.displayName}</span>
           </div>
           <Button variant="ghost" size="sm" onClick={() => setPageUi(null)}>{t('plugins.closeInterface')}</Button>
        </div>
        <div className="flex-1 w-full bg-background"><iframe sandbox="allow-scripts allow-popups" className="w-full h-full border-0" srcDoc={iframeSrcDoc} title={`${plugin.displayName} Page`} /></div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen text-foreground font-sans">
      {/* Premium Hero Section */}
      <header className="relative pt-10 pb-16 overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent opacity-50" />
        <div className="absolute -top-24 -left-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-20 w-96 h-96 bg-secondary/10 rounded-full blur-3xl opacity-50" />
        
        <div className="relative mx-auto max-w-[1200px] px-6 text-center">
          <button 
            onClick={() => router.push('/dashboard/plugins')}
            className="group mb-8 inline-flex items-center gap-2 px-4 py-2 bg-muted/50 hover:bg-muted rounded-full text-xs font-bold text-muted-foreground hover:text-foreground transition-all border border-border/50"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
            {t('plugins.marketplace')}
          </button>

          <div className="flex flex-col items-center">
            <div className="relative group mb-8">
              <div className="absolute inset-0 bg-primary/20 rounded-[2.5rem] blur-xl group-hover:bg-primary/30 transition-all opacity-0 group-hover:opacity-100" />
              <div className="relative w-32 h-32 md:w-40 md:h-40 bg-card border-[3px] border-border rounded-[2.5rem] shadow-2xl flex items-center justify-center text-6xl font-black text-muted-foreground overflow-hidden group-hover:scale-105 transition-transform duration-500">
                {plugin.iconUrl ? (
                  <img src={plugin.iconUrl} alt={plugin.displayName} className="w-full h-full object-cover" />
                ) : (
                  (plugin.displayName || '?')[0].toUpperCase()
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
              <span className="px-4 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest">
                {plugin.category}
              </span>
              {isInstalled && (
                <span className="px-4 py-1 bg-green-500/10 text-green-500 border border-green-500/20 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                  <CheckCircle className="w-3 h-3" /> {t('plugins.installed')}
                </span>
              )}
            </div>

            <h1 className="text-4xl md:text-6xl font-black text-foreground tracking-tighter mb-4 leading-tight">
              {plugin.displayName}
            </h1>
            
            <div className="flex items-center gap-4 text-sm font-bold text-muted-foreground bg-muted/30 px-6 py-2 rounded-full border border-border/50">
              <span className="flex items-center gap-2"><User className="w-4 h-4 text-primary" /> {(plugin.author as any)?.name || plugin.author || 'Erik'}</span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> v{latestVer.version}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left Column: Content */}
          <div className="lg:col-span-8 space-y-16">
            <section className="space-y-6">
               <div className="flex items-center gap-3">
                  <div className="w-1 h-8 bg-primary rounded-full" />
                  <h2 className="text-3xl font-black text-foreground tracking-tight">{t('plugins.aboutTitle')}</h2>
               </div>
               <div className="p-8 bg-card border border-border rounded-[2.5rem] shadow-sm space-y-4">
                  <p className="text-lg font-bold text-foreground leading-relaxed">{plugin.description}</p>
                  {plugin.longDescription && (
                    <div className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{plugin.longDescription}</div>
                  )}
               </div>
            </section>

            {plugin.screenshots && plugin.screenshots.length > 0 && (
              <section className="space-y-6">
                 <h2 className="text-2xl font-black text-foreground tracking-tight">{t('plugins.screenshotsTitle')}</h2>
                 <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide snap-x group">
                    {plugin.screenshots.map((s: string, i: number) => (
                      <div key={i} className="relative shrink-0 snap-center first:pl-2 rounded-[2rem] overflow-hidden border border-border shadow-lg hover:scale-[1.02] transition-transform duration-500">
                        <img src={s} alt={`Preview ${i + 1}`} className="h-72 md:h-96 object-cover" />
                      </div>
                    ))}
                 </div>
              </section>
            )}

            <section className="space-y-8">
               <h2 className="text-2xl font-black text-foreground tracking-tight">{t('plugins.versionsTitle')}</h2>
               <div className="space-y-6 border-l-2 border-border/50 ml-4 pl-8">
                  {plugin.versions?.map((v: any) => (
                    <div key={v.id} className="relative group">
                       <div className="absolute -left-[2.15rem] top-1.5 w-4 h-4 rounded-full border-2 border-primary bg-background group-hover:scale-125 transition-transform" />
                       <div className="p-6 bg-card border border-border rounded-3xl space-y-3 hover:border-primary/30 transition-colors shadow-sm">
                          <div className="flex items-center justify-between">
                             <span className="text-lg font-black font-mono">v{v.version}</span>
                             <span className="text-xs font-bold text-muted-foreground uppercase opacity-50">{new Date(v.publishedAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{v.changelog || t('plugins.noLogs')}</p>
                          <div className="flex items-center gap-2 pt-2">
                             <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", v.reviewStatus === 'approved' ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500")}>
                               {v.reviewStatus === 'approved' ? t('common.done') : 'Pending Review'}
                             </span>
                          </div>
                       </div>
                    </div>
                  ))}
               </div>
            </section>

            {/* Read-only Reviews Section */}
            <section className="space-y-8">
               <h2 className="text-2xl font-black text-foreground tracking-tight">{t('plugins.rating')}</h2>
               <div className="space-y-6">
                 {plugin.recentReviews && plugin.recentReviews.length > 0 ? plugin.recentReviews.map((r: any) => (
                   <div key={r.id} className="p-6 bg-muted/20 border border-border rounded-[2rem] flex flex-col md:flex-row gap-6 hover:bg-muted/30 transition-colors">
                      <div className="shrink-0">
                         {r.avatarUrl ? (
                           <img src={r.avatarUrl} alt={r.username} className="w-12 h-12 rounded-full border border-border" />
                         ) : (
                           <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center font-bold">{(r.username || '?')[0].toUpperCase()}</div>
                         )}
                      </div>
                      <div className="flex-1 space-y-2">
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                               <span className="font-black text-foreground">{r.username}</span>
                               <div className="flex">
                                 {[1,2,3,4,5].map((s) => <Star key={s} className={cn("w-3 h-3", s <= r.rating ? "fill-yellow-500 text-yellow-500" : "text-muted")} />)}
                               </div>
                            </div>
                            <time className="text-[10px] font-mono text-muted-foreground uppercase">{new Date(r.createdAt).toLocaleDateString()}</time>
                         </div>
                         <p className="text-muted-foreground text-sm leading-relaxed">{r.comment || r.content}</p>
                      </div>
                   </div>
                 )) : (
                   <div className="text-center py-16 p-8 bg-muted/10 border border-dashed border-border rounded-[2rem] text-muted-foreground space-y-2">
                     <MessageSquare className="w-12 h-12 mx-auto opacity-10" />
                     <p className="font-medium">{t('plugins.noLogs')}</p>
                   </div>
                 )}
               </div>
            </section>
          </div>

          {/* Right Column: Sidebar */}
          <div className="lg:col-span-4 space-y-6">
             <div className="sticky top-28 space-y-6">
                {/* Dashboard Actions Box */}
                <div className="p-8 bg-card border border-border rounded-[2.5rem] shadow-xl space-y-6">
                   <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{isInstalled ? t('plugins.installed') : 'Marketplace'}</span>
                      <div className="text-3xl font-black text-foreground">
                         {isInstalled ? currentVersion : (plugin.pricing?.type === 'free' ? t('plugins.free') : t('plugins.premium'))}
                      </div>
                   </div>
                   
                   <div className="space-y-3">
                      {isInstalling ? (
                         <Button disabled className="w-full py-5 bg-muted text-muted-foreground rounded-2xl font-black text-lg opacity-80 flex items-center justify-center gap-3">
                            <Loader2 className="w-5 h-5 animate-spin" /> {t('common.loading')}
                         </Button>
                      ) : isInstalled ? (
                         <div className="space-y-3">
                            {hasUpdate && (
                               <Button onClick={handleUpdate} variant="default" className="w-full py-5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-lg shadow-lg shadow-amber-500/20 transition-all">
                                  {t('plugins.updateTo')} v{latestVer.version}
                               </Button>
                            )}
                            {plugin.slots?.includes('page') && (
                               <Button onClick={() => fetchPlugin(name)} variant="default" className="w-full py-5 bg-primary text-primary-foreground rounded-2xl font-black text-lg hover:brightness-110 shadow-lg shadow-primary/10 transition-all">
                                  <Zap className="w-5 h-5 mr-2" /> {t('plugins.runPlugin')}
                               </Button>
                            )}
                            <Button onClick={() => setShowUninstall(true)} variant="outline" className="w-full py-5 border-red-500/20 text-red-500 hover:bg-red-500/10 rounded-2xl font-black text-lg transition-all">
                               {t('plugins.uninstall')}
                            </Button>
                         </div>
                      ) : (
                         <div className="space-y-4">
                            {plugin.isDownloadable !== false ? (
                               <Button onClick={handleInstall} disabled={!canInstallByStatus} className="flex items-center justify-center gap-3 w-full py-5 bg-foreground text-background rounded-2xl font-black text-lg hover:brightness-110 shadow-lg shadow-foreground/10 transition-all group">
                                  <Download className="w-5 h-5 group-hover:bounce" /> {t('plugins.installNow').replace(' Install Now', '').replace('Zip', '').trim() || 'Download'}
                               </Button>
                            ) : (
                               <div className="flex flex-col gap-2 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl text-center">
                                  <span className="text-red-500 font-bold text-sm tracking-tight flex items-center justify-center gap-2">
                                    <Shield className="w-4 h-4" /> Artifact Missing
                                  </span>
                                  <p className="text-[10px] text-muted-foreground">This plugin needs to be republished by the developer.</p>
                               </div>
                            )}
                            {!canInstallByStatus && (
                               <p className="text-[10px] text-center text-amber-600 font-bold uppercase tracking-wider flex justify-center items-center gap-1.5 mt-2">
                                  <AlertTriangle className="w-3.5 h-3.5"/> {t('plugins.requiresPermission')}
                               </p>
                            )}
                         </div>
                      )}
                   </div>

                   <div className="space-y-4 pt-4 border-t border-border/60">
                       <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 font-bold text-muted-foreground"><Download className="w-4 h-4 text-primary"/> {t('plugins.downloads')}</span>
                          <span className="font-black text-foreground">{plugin.downloads}</span>
                       </div>
                       <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 font-bold text-muted-foreground"><Star className="w-4 h-4 text-yellow-500"/> {t('plugins.rating')}</span>
                          <span className="font-black text-foreground">{plugin.rating > 0 ? `${plugin.rating.toFixed(1)} / 5` : 'N/A'}</span>
                       </div>
                   </div>
                </div>

                <div className="p-8 bg-card border border-border rounded-[2.5rem] shadow-sm space-y-6">
                   <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">{t('plugins.systemInfo')}</h3>
                   <div className="space-y-4">
                       {plugin.website && (
                          <a href={plugin.website} target="_blank" className="flex items-center justify-between text-sm group hover:text-primary transition-colors">
                             <span className="flex items-center gap-2 font-bold text-muted-foreground group-hover:text-primary"><Globe className="w-4 h-4"/> Website</span>
                             <ExternalLink className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                          </a>
                       )}
                       {plugin.repository && (
                          <a href={plugin.repository} target="_blank" className="flex items-center justify-between text-sm group hover:text-primary transition-colors">
                             <span className="flex items-center gap-2 font-bold text-muted-foreground group-hover:text-primary"><Github className="w-4 h-4"/> Source Code</span>
                             <ExternalLink className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                          </a>
                       )}
                       <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 font-bold text-muted-foreground"><Shield className="w-4 h-4"/> License</span>
                          <span className="px-2 py-0.5 bg-muted rounded font-mono text-[10px] font-bold text-muted-foreground uppercase">{plugin.license || 'MIT'}</span>
                       </div>
                   </div>
                   
                   {plugin.tags && plugin.tags.length > 0 && (
                      <div className="pt-4 border-t border-border/60">
                         <div className="flex flex-wrap gap-2">
                            {plugin.tags.map((tg: string) => (
                               <span key={tg} className="px-3 py-1 bg-muted/50 rounded-lg text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                  {tg}
                                </span>
                            ))}
                         </div>
                      </div>
                   )}
                </div>

                {/* Dashboard Disclaimer */}
                <div className="p-6 bg-secondary/30 border border-border rounded-[2rem] space-y-3 relative overflow-hidden group">
                   <span className="absolute top-0 right-0 p-2 text-foreground/5 group-hover:text-primary/10 transition-colors"><Shield className="w-12 h-12 -translate-y-1/2 translate-x-1/2" /></span>
                   <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      {t('plugins.betaWarningTitle')}
                   </h3>
                   <p className="text-xs text-muted-foreground leading-relaxed">
                      {t('plugins.betaWarningDesc')}
                   </p>
                </div>
             </div>
          </div>
        </div>
      </main>

      {/* Delete/Uninstall Confirmation Modal */}
      <AnimatePresence>
      {showUninstall && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
           <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="w-full max-w-sm bg-card border border-border rounded-[3rem] p-8 shadow-2xl text-center space-y-6">
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto"><Trash2 className="w-8 h-8"/></div>
              <div className="space-y-2">
                 <h3 className="text-2xl font-black tracking-tight text-foreground">{t('plugins.deleteConfirmTitle')}</h3>
                 <p className="text-muted-foreground text-sm font-medium">{t('plugins.deleteConfirmDesc')}</p>
              </div>
              <div className="flex gap-3">
                 <Button variant="outline" className="flex-1 py-4 rounded-2xl font-bold" onClick={() => setShowUninstall(false)}>{t('common.cancel')}</Button>
                 <Button variant="destructive" className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold shadow-lg shadow-red-500/20" onClick={handleUninstall}>{t('common.delete')}</Button>
              </div>
           </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
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

function PlayIcon({ className }: { className?: string }) {
   return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="5 3 19 12 5 21 5 3"/></svg>
}