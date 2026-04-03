'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, Star, Download, ExternalLink, Shield,
  ChevronDown, ChevronUp, RefreshCw, Check, Trash2,
  AlertTriangle, Globe, Code2, Tag, Clock, Package,
} from 'lucide-react';
import Link from 'next/link';

const PLUGIN_REGISTRY_URL = process.env.NEXT_PUBLIC_PLUGIN_REGISTRY_URL || 'http://localhost:5005';
const LOCAL_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.142:5000";

interface PluginDetail {
  name: string;
  displayName: string;
  description: string;
  longDescription: string | null;
  category: string;
  iconUrl: string | null;
  author: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    bio: string | null;
    website: string | null;
  };
  downloads: number;
  rating: number;
  latestVersion: string;
  pricing: { type: string; price?: number; currency?: string } | null;
  tags: string[];
  screenshots: string[];
  website: string | null;
  repository: string | null;
  license: string;
  type: string;
  runtime: string;
  versionCount: number;
  versions: {
    id: string;
    version: string;
    publishedAt: string;
    deprecated: boolean;
    isSecurityUpdate: boolean;
    changelog: string | null;
  }[];
  capabilities: string[];
}

const categoryAccents: Record<string, string> = {
  integration: '#38BDF8', automation: '#FB923C', analytics: '#34D399',
  ai: '#C084FC', storage: '#FBBF24', ui: '#F472B6',
  communication: '#2DD4BF', security: '#F87171',
  productivity: '#818CF8', utilities: '#94A3B8',
};
const getAccent = (cat: string) => categoryAccents[cat] ?? '#94A3B8';

const capabilityMeta: Record<string, { desc: string; risk: 'low' | 'medium' | 'high' }> = {
  'read:files':    { desc: 'Read access to your files and folders', risk: 'medium' },
  'write:files':   { desc: 'Create, edit, and delete your files', risk: 'high' },
  'read:user':     { desc: 'Access basic profile information', risk: 'low' },
  'read:calendar': { desc: 'View your calendar events', risk: 'medium' },
  'send:email':    { desc: 'Send emails on your behalf', risk: 'high' },
  'admin':         { desc: 'Full administrative access', risk: 'high' },
};

export default function PluginDetailPage() {
  const params  = useParams();
  const name    = params?.name as string;

  const [plugin, setPlugin]     = useState<PluginDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'versions' | 'permissions'>('overview');
  const [installState, setInstallState] = useState<'idle' | 'installing' | 'installed'>('idle');
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showUninstall, setShowUninstall] = useState(false);

  useEffect(() => { if (name) fetchPlugin(name); }, [name]);

  const fetchPlugin = async (n: string) => {
    try {
      const res = await fetch(`${PLUGIN_REGISTRY_URL}/api/plugins/${n}`);
      if (res.ok) setPlugin(await res.json());

      const token = localStorage.getItem('token');
      const localRes = await fetch(`${LOCAL_API_URL}/api/plugins/installed`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (localRes.ok) {
        const localData = await localRes.json();
        const lp = (localData.plugins || []).find((p: any) => p.name === n);
        if (lp) {
          setInstallState('installed');
          setCurrentVersion(lp.currentVersion || (lp.versions && lp.versions[0]));
        } else {
          setInstallState('idle');
        }
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleInstall = async () => {
    if (installState === 'installed') { setShowUninstall(true); return; }
    setInstallState('installing');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${LOCAL_API_URL}/api/plugins/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ pluginName: name, version: plugin?.versions[0]?.version || '1.0.0' })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to install');
      setInstallState('installed');
      setCurrentVersion(plugin?.versions[0]?.version || '1.0.0');
      alert('Plugin installed successfully');
    } catch (err: any) {
      alert(err.message || 'Installation failed');
      setInstallState('idle');
    }
  };

  const handleUninstall = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${LOCAL_API_URL}/api/plugins/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ pluginName: name })
      });
      if (!res.ok) throw new Error('Failed to uninstall');
      setInstallState('idle');
      setCurrentVersion(null);
      setShowUninstall(false);
      alert('Plugin uninstalled');
    } catch (err: any) {
      alert(err.message || 'Uninstallation failed');
    }
  };

  const toggleExpanded = (v: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(v) ? s.delete(v) : s.add(v); return s; });

  if (loading) return (
    <div className="space-y-6">
      <div className="h-32 bg-muted/40 rounded-3xl animate-pulse" />
      <div className="h-64 bg-muted/40 rounded-2xl animate-pulse" />
    </div>
  );

  if (!plugin) return (
    <div className="text-center py-20">
      <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
      <h2 className="text-lg font-semibold text-foreground mb-2">Plugin not found</h2>
      <p className="text-sm text-muted-foreground mb-4">This plugin doesn't exist or was removed.</p>
      <Link href="/dashboard/plugins" className="inline-flex items-center gap-2 px-4 py-2 bg-muted/50 hover:bg-muted border border-border/60 rounded-lg text-sm text-foreground transition-all">
        <ArrowLeft className="w-4 h-4" /> Back to Plugins
      </Link>
    </div>
  );

  const accent       = getAccent(plugin.category);
  const latestVer    = plugin.versions[0];
  const isInstalled  = installState === 'installed';
  const isInstalling = installState === 'installing';

  return (
    <div className="space-y-6">
      {/* Accent bg strip */}
      <div className="h-32 -mx-6 -mt-6 rounded-t-3xl" style={{ background: `linear-gradient(135deg, ${accent}15 0%, ${accent}05 100%)` }} />

      <div className="space-y-6">
        {/* Back */}
        <Link href="/dashboard/plugins" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Plugins
        </Link>

        {/* Header card */}
        <div className="p-6 bg-muted/30 border border-border/60 rounded-2xl">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Icon */}
            <div 
              className="w-20 h-20 rounded-xl flex items-center justify-center text-2xl font-bold shrink-0"
              style={{ backgroundColor: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}
            >
              {plugin.iconUrl
                ? <img src={plugin.iconUrl} alt={plugin.displayName} className="w-full h-full object-cover rounded-xl" />
                : plugin.displayName.charAt(0).toUpperCase()
              }
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: accent }}>{plugin.category}</div>
              <h1 className="text-2xl font-bold text-foreground mb-1">{plugin.displayName}</h1>
              <p className="text-sm text-muted-foreground mb-3">by {plugin.author.name}</p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {plugin.rating > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                    {plugin.rating.toFixed(1)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Download className="w-4 h-4" />
                  {plugin.downloads.toLocaleString()}
                </span>
                {latestVer && (
                  <span className="flex items-center gap-1">
                    <Package className="w-4 h-4" />
                    v{latestVer.version}
                  </span>
                )}
              </div>
            </div>

            {/* CTA */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="text-xl font-bold text-foreground">
                {plugin.pricing?.type === 'free'
                  ? 'Free'
                  : plugin.pricing?.price
                  ? `${plugin.pricing.currency} ${plugin.pricing.price}`
                  : ''}
              </div>
              <button
                className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                  isInstalled 
                    ? 'bg-muted/50 border border-border/60 text-muted-foreground hover:text-foreground' 
                    : isInstalling
                    ? 'bg-primary/80 text-white cursor-wait'
                    : 'bg-primary text-white hover:brightness-110'
                }`}
                onClick={handleInstall}
                disabled={isInstalling}
              >
                {isInstalling ? (
                  <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Installing...</span>
                ) : isInstalled ? (
                  <span className="flex items-center gap-2"><Check className="w-4 h-4" /> Installed</span>
                ) : (
                  'Install'
                )}
              </button>
              {isInstalled && (
                <button className="text-xs text-muted-foreground hover:text-red-500 transition-colors flex items-center gap-1" onClick={() => setShowUninstall(true)}>
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              )}
            </div>
          </div>

          <p className="text-sm text-muted-foreground mt-4 pt-4 border-t border-border/40">{plugin.description}</p>

          {/* Tags */}
          {plugin.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {plugin.tags.map(t => (
                <span key={t} className="px-2 py-1 bg-muted/60 rounded text-xs text-muted-foreground">{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex bg-muted/50 border border-border/60 rounded-lg p-1">
          {(['overview', 'versions', 'permissions'] as const).map(tab => (
            <button
              key={tab}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                activeTab === tab 
                  ? 'bg-background shadow-sm text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'overview'    && 'Overview'}
              {tab === 'versions'    && `Versions (${plugin.versionCount})`}
              {tab === 'permissions' && 'Permissions'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6 bg-muted/30 border border-border/60 rounded-2xl">

          {/* Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* About */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">About</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{plugin.longDescription || plugin.description}</p>
              </div>

              {/* Screenshots */}
              {plugin.screenshots.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Screenshots</h3>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {plugin.screenshots.map((s, i) => (
                      <img key={i} src={s} alt={`Screenshot ${i + 1}`} className="h-40 rounded-lg border border-border/60 shrink-0" />
                    ))}
                  </div>
                </div>
              )}

              {/* Meta grid */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Version</div>
                      <div className="text-sm font-medium text-foreground">{latestVer?.version || 'N/A'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">License</div>
                      <div className="text-sm font-medium text-foreground">{plugin.license}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                    <Code2 className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Type</div>
                      <div className="text-sm font-medium text-foreground">{plugin.type}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Runtime</div>
                      <div className="text-sm font-medium text-foreground">{plugin.runtime}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Links */}
              {(plugin.website || plugin.repository) && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Links</h3>
                  <div className="flex flex-wrap gap-2">
                    {plugin.website && (
                      <a href={plugin.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted border border-border/60 rounded-lg text-sm text-foreground transition-all">
                        <Globe className="w-4 h-4" /> Website
                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </a>
                    )}
                    {plugin.repository && (
                      <a href={plugin.repository} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted border border-border/60 rounded-lg text-sm text-foreground transition-all">
                        <Code2 className="w-4 h-4" /> Source
                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Author */}
              {plugin.author.bio && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Author</h3>
                  <div className="flex items-start gap-3 p-4 bg-muted/40 rounded-lg">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                      style={{ backgroundColor: `${accent}15`, color: accent }}
                    >
                      {plugin.author.avatarUrl
                        ? <img src={plugin.author.avatarUrl} alt={plugin.author.name} className="w-full h-full object-cover rounded-full" />
                        : plugin.author.name.charAt(0)
                      }
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{plugin.author.name}</div>
                      <div className="text-sm text-muted-foreground">{plugin.author.bio}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Versions */}
          {activeTab === 'versions' && (
            <div className="space-y-3">
              {plugin.versions.map((v, i) => (
                <div key={v.id} className={`p-4 bg-muted/40 rounded-lg border ${i === 0 ? 'border-primary/30' : 'border-border/60'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      {i === 0 && <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded">Latest</span>}
                      {v.isSecurityUpdate && <span className="px-2 py-0.5 bg-red-500/10 text-red-500 text-xs font-medium rounded">Security</span>}
                      {v.deprecated && <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-medium rounded">Deprecated</span>}
                      <span className="font-medium text-foreground">v{v.version}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>
                        {new Date(v.publishedAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </span>
                      {v.changelog && (
                        <button onClick={() => v.changelog && toggleExpanded(v.version)}>
                          {expanded.has(v.version) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                  {expanded.has(v.version) && v.changelog && (
                    <pre className="mt-3 p-3 bg-background rounded text-xs text-muted-foreground overflow-x-auto">{v.changelog}</pre>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Permissions */}
          {activeTab === 'permissions' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-600">Review the permissions this plugin requests before installing. Only install plugins you trust.</p>
              </div>
              {plugin.capabilities.length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No special permissions required</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {plugin.capabilities.map(cap => {
                    const meta = capabilityMeta[cap] || { desc: 'Custom permission', risk: 'low' as const };
                    const riskColors = {
                      low: 'bg-green-500/10 border-green-500/20',
                      medium: 'bg-yellow-500/10 border-yellow-500/20',
                      high: 'bg-red-500/10 border-red-500/20',
                    };
                    const riskTextColors = {
                      low: 'text-green-600',
                      medium: 'text-yellow-600',
                      high: 'text-red-600',
                    };
                    return (
                      <div key={cap} className={`flex items-start gap-3 p-4 rounded-lg border ${riskColors[meta.risk]}`}>
                        <Shield className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-mono text-sm font-medium text-foreground">{cap}</div>
                          <div className="text-sm text-muted-foreground">{meta.desc}</div>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-medium uppercase shrink-0 ${riskTextColors[meta.risk]} bg-background/50`}>{meta.risk}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Uninstall modal */}
      {showUninstall && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setShowUninstall(false)}>
          <div className="bg-background border border-border/60 rounded-2xl p-6 max-w-sm w-full mx-4 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Remove {plugin.displayName}?</h3>
            <p className="text-sm text-muted-foreground mb-4">This plugin will be uninstalled and its data may be lost.</p>
            <div className="flex gap-2">
              <button className="flex-1 py-2 px-4 bg-muted/50 hover:bg-muted border border-border/60 rounded-lg text-sm font-medium text-foreground transition-all" onClick={() => setShowUninstall(false)}>Cancel</button>
              <button className="flex-1 py-2 px-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-sm font-medium text-red-500 transition-all" onClick={handleUninstall}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}