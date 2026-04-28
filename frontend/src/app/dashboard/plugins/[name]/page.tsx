'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Star, Download, ExternalLink, Shield,
  Trash2, AlertTriangle, Globe, Clock, Package,
  User, CheckCircle, Zap, Loader2, Github, MessageSquare, ChevronRight
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
                name: localPlugin.name, displayName: localPlugin.displayName || localPlugin.name,
                description: 'Instalado localmente. Cargando más datos...', category: 'utilities',
                iconUrl: null, author: 'Local', downloads: 0, rating: 0,
                latestVersion: localPlugin.version || '1.0.0', pricing: null,
                tags: ['local'], screenshots: [], versions: [], recentReviews: []
             });
             if (localPlugin.isActive && localPlugin.slots?.includes('page')) {
               const pageRes = await axios.get(API_ENDPOINTS.PLUGINS.PAGE(n), { headers: { Authorization: `Bearer ${token}` }, withCredentials: true });
               if (pageRes.status === 200) setPageUi(pageRes.data);
             }
          }
        }
      } catch (err) {}
      const res = await fetch(`${PLUGIN_REGISTRY_URL}/api/plugins/${n}`).catch(() => null);
      if (res && res.ok) { const data = await res.json(); setPlugin(data); }
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
      if (localActivation.ok) { setInstallState('installed'); setCurrentVersion(version); }
      else throw new Error(localActivation.error);
    } catch (err: any) { setInstallState('idle'); }
  };

  const handleUninstall = async () => {
    try {
      const instanceId = getInstanceId();
      if (instanceId) { await fetch(`${PLUGIN_REGISTRY_URL}/api/plugins/i/${instanceId}/uninstall?pluginName=${encodeURIComponent(name)}`, { method: 'DELETE' }).catch(() => {}); }
      await uninstallPluginLocally(name);
      setInstallState('idle'); setCurrentVersion(null); setShowUninstall(false);
    } catch (err: any) {}
  };

  const handleUpdate = async () => {
    if (!plugin?.latestVersion) return;
    setInstallState('installing');
    try {
      const targetVersion = plugin.latestVersion;
      const instanceId = getInstanceId();
      if (instanceId) { await fetch(`${PLUGIN_REGISTRY_URL}/api/plugins/i/${instanceId}/install`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pluginName: name, version: targetVersion }) }).catch(() => {}); }
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
      <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center">
         <Package className="w-8 h-8 text-muted-foreground/60" />
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
              <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center font-bold text-sm text-foreground overflow-hidden border border-border/50">
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
    <div className="w-full max-w-[1400px] mx-auto space-y-6 pb-12">
      {/* Back button */}
      <button onClick={() => router.push('/dashboard/plugins')}
        className="group inline-flex items-center gap-2 px-4 py-2 bg-card border border-border/60 hover:bg-muted/50 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground transition-all">
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        {t('plugins.marketplace')}
      </button>

      {/* Plugin Hero Card */}
      <div className="bg-card border border-border/40 rounded-3xl p-6 md:p-8 hover:shadow-sm transition-shadow">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* Icon */}
          <div className="w-20 h-20 md:w-24 md:h-24 bg-muted/50 border border-border/50 rounded-2xl flex items-center justify-center text-4xl font-bold text-muted-foreground overflow-hidden shrink-0">
            {plugin.iconUrl ? <img src={plugin.iconUrl} alt={plugin.displayName} className="w-full h-full object-cover" /> : (plugin.displayName || '?')[0].toUpperCase()}
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-bold uppercase tracking-wider">{plugin.category}</span>
              {isInstalled && (
                <span className="px-2.5 py-1 bg-green-500/10 text-green-500 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle className="w-3 h-3" /> {t('plugins.installed')}
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">{plugin.displayName}</h1>
            <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5"><User className="w-4 h-4 text-primary" /> {(plugin.author as any)?.name || plugin.author || 'Erik'}</span>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-primary" /> v{latestVer.version}</span>
              {plugin.downloads > 0 && (<><span className="text-border">·</span><span className="flex items-center gap-1.5"><Download className="w-4 h-4" /> {plugin.downloads}</span></>)}
            </div>
          </div>
          {/* Actions */}
          <div className="w-full md:w-auto shrink-0 space-y-2">
            {isInstalling ? (
              <Button disabled className="w-full md:w-48 py-3 rounded-xl font-bold flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}</Button>
            ) : isInstalled ? (<>
              {hasUpdate && <Button onClick={handleUpdate} className="w-full md:w-48 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold">{t('plugins.updateTo')} v{latestVer.version}</Button>}
              {plugin.slots?.includes('page') && <Button onClick={() => fetchPlugin(name)} className="w-full md:w-48 py-3 rounded-xl font-bold"><Zap className="w-4 h-4 mr-2" /> {t('plugins.runPlugin')}</Button>}
              <Button onClick={() => setShowUninstall(true)} variant="outline" className="w-full md:w-48 py-3 border-red-500/20 text-red-500 hover:bg-red-500/10 rounded-xl font-bold">{t('plugins.uninstall')}</Button>
            </>) : (
              plugin.isDownloadable !== false ? (
                <Button onClick={handleInstall} disabled={!canInstallByStatus} className="w-full md:w-48 py-3 rounded-xl font-bold"><Download className="w-4 h-4 mr-2" /> Download</Button>
              ) : (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                  <span className="text-red-500 font-bold text-sm flex items-center justify-center gap-2"><Shield className="w-4 h-4" /> Artifact Missing</span>
                  <p className="text-[10px] text-muted-foreground mt-1">This plugin needs to be republished.</p>
                </div>
              )
            )}
            {!canInstallByStatus && !isInstalled && (
              <p className="text-[10px] text-center text-amber-600 font-bold uppercase tracking-wider flex justify-center items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5"/> {t('plugins.requiresPermission')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* About */}
          <div className="bg-card border border-border/40 rounded-3xl p-6 hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-3 mb-5">
              <Package className="w-5 h-5 text-blue-500" />
              <span className="font-bold text-base text-foreground">{t('plugins.aboutTitle')}</span>
            </div>
            <p className="text-base font-medium text-foreground leading-relaxed">{plugin.description}</p>
            {plugin.longDescription && <div className="text-sm text-muted-foreground leading-relaxed mt-4 whitespace-pre-wrap">{plugin.longDescription}</div>}
          </div>

          {/* Screenshots */}
          {plugin.screenshots?.length > 0 && (
            <div className="bg-card border border-border/40 rounded-3xl p-6 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3 mb-5">
                <span className="font-bold text-base text-foreground">{t('plugins.screenshotsTitle')}</span>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
                {plugin.screenshots.map((s: string, i: number) => (
                  <div key={i} className="shrink-0 snap-center rounded-2xl overflow-hidden border border-border/50 hover:scale-[1.02] transition-transform">
                    <img src={s} alt={`Preview ${i + 1}`} className="h-56 md:h-72 object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Versions */}
          {plugin.versions?.length > 0 && (
            <div className="bg-card border border-border/40 rounded-3xl p-6 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3 mb-5">
                <Clock className="w-5 h-5 text-purple-500" />
                <span className="font-bold text-base text-foreground">{t('plugins.versionsTitle')}</span>
              </div>
              <div className="space-y-3">
                {plugin.versions.map((v: any) => (
                  <div key={v.id} className="flex items-start gap-4 px-4 py-3.5 rounded-2xl border border-border/40 hover:bg-muted/40 transition-colors">
                    <div className="relative mt-1.5 flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-primary/50 ring-4 ring-background z-10" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-bold font-mono">v{v.version}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{new Date(v.publishedAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{v.changelog || t('plugins.noLogs')}</p>
                      <span className={cn("inline-block mt-2 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider", v.reviewStatus === 'approved' ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500")}>
                        {v.reviewStatus === 'approved' ? t('common.done') : 'Pending Review'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reviews */}
          <div className="bg-card border border-border/40 rounded-3xl p-6 hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-3 mb-5">
              <Star className="w-5 h-5 text-yellow-500" />
              <span className="font-bold text-base text-foreground">{t('plugins.rating')}</span>
              {plugin.rating > 0 && <span className="text-sm text-muted-foreground ml-auto font-medium">{plugin.rating.toFixed(1)} / 5</span>}
            </div>
            {plugin.recentReviews?.length > 0 ? plugin.recentReviews.map((r: any) => (
              <div key={r.id} className="flex items-start gap-4 px-4 py-3.5 rounded-2xl border border-border/40 hover:bg-muted/40 transition-colors mb-3 last:mb-0">
                <div className="w-10 h-10 rounded-xl bg-muted/50 border border-border/50 flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                  {r.avatarUrl ? <img src={r.avatarUrl} alt={r.username} className="w-full h-full object-cover" /> : (r.username || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{r.username}</span>
                      <div className="flex">{[1,2,3,4,5].map(s => <Star key={s} className={cn("w-3 h-3", s <= r.rating ? "fill-yellow-500 text-yellow-500" : "text-muted")} />)}</div>
                    </div>
                    <time className="text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</time>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{r.comment || r.content}</p>
                </div>
              </div>
            )) : (
              <div className="py-12 text-center text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">{t('plugins.noLogs')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* System Info */}
          <div className="bg-card border border-border/40 rounded-3xl p-6 hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-3 mb-5">
              <Shield className="w-5 h-5 text-indigo-500" />
              <span className="font-bold text-base text-foreground">{t('plugins.systemInfo')}</span>
            </div>
            <div className="space-y-4">
              {plugin.website && (
                <a href={plugin.website} target="_blank" className="flex items-center justify-between text-sm group hover:text-primary transition-colors">
                  <span className="flex items-center gap-2 font-medium text-muted-foreground group-hover:text-primary"><Globe className="w-4 h-4"/> Website</span>
                  <ExternalLink className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                </a>
              )}
              {plugin.repository && (
                <a href={plugin.repository} target="_blank" className="flex items-center justify-between text-sm group hover:text-primary transition-colors">
                  <span className="flex items-center gap-2 font-medium text-muted-foreground group-hover:text-primary"><Github className="w-4 h-4"/> Source Code</span>
                  <ExternalLink className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                </a>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium text-muted-foreground"><Shield className="w-4 h-4"/> License</span>
                <span className="px-2 py-0.5 bg-muted rounded-lg font-mono text-[10px] font-bold text-muted-foreground uppercase">{plugin.license || 'MIT'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium text-muted-foreground"><Download className="w-4 h-4"/> {t('plugins.downloads')}</span>
                <span className="font-bold text-foreground">{plugin.downloads}</span>
              </div>
            </div>
            {plugin.tags?.length > 0 && (
              <div className="pt-4 mt-4 border-t border-border/40">
                <div className="flex flex-wrap gap-2">
                  {plugin.tags.map((tg: string) => (
                    <span key={tg} className="px-2.5 py-1 bg-muted/50 rounded-lg text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{tg}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Beta Warning */}
          <div className="bg-card border border-border/40 rounded-3xl p-6 hover:shadow-sm transition-shadow">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-primary" />
              {t('plugins.betaWarningTitle')}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{t('plugins.betaWarningDesc')}</p>
          </div>
        </div>
      </div>

      {/* Uninstall Modal */}
      <AnimatePresence>
      {showUninstall && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
           <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="w-full max-w-sm bg-card border border-border rounded-3xl p-8 shadow-2xl text-center space-y-6">
              <div className="w-14 h-14 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto"><Trash2 className="w-7 h-7"/></div>
              <div className="space-y-2">
                 <h3 className="text-xl font-bold tracking-tight text-foreground">{t('plugins.deleteConfirmTitle')}</h3>
                 <p className="text-muted-foreground text-sm">{t('plugins.deleteConfirmDesc')}</p>
              </div>
              <div className="flex gap-3">
                 <Button variant="outline" className="flex-1 py-3 rounded-xl font-bold" onClick={() => setShowUninstall(false)}>{t('common.cancel')}</Button>
                 <Button variant="destructive" className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold" onClick={handleUninstall}>{t('common.delete')}</Button>
              </div>
           </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}