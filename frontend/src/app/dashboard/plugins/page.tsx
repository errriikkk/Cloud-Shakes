'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Star, Download, X, Grid, List, Zap, ChevronRight, ArrowRight, Sparkles, HardDrive } from 'lucide-react';
import Link from 'next/link';

const PLUGIN_REGISTRY_URL = process.env.NEXT_PUBLIC_PLUGIN_REGISTRY_URL || 'http://localhost:5005';

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
  pricing: { type: string; price?: number; currency?: string } | null;
  tags: string[];
}

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  pluginCount: number;
}

const categoryMeta: Record<string, { color: string; accent: string; label: string }> = {
  integration:   { color: '#0F172A', accent: '#38BDF8', label: 'Integration'   },
  automation:    { color: '#1C1008', accent: '#FB923C', label: 'Automation'    },
  analytics:     { color: '#071A10', accent: '#34D399', label: 'Analytics'     },
  ai:            { color: '#120A1E', accent: '#C084FC', label: 'AI'            },
  storage:       { color: '#1A1506', accent: '#FBBF24', label: 'Storage'       },
  ui:            { color: '#1A0A12', accent: '#F472B6', label: 'UI'            },
  communication: { color: '#051514', accent: '#2DD4BF', label: 'Comms'        },
  security:      { color: '#190808', accent: '#F87171', label: 'Security'      },
  productivity:  { color: '#0A0D1F', accent: '#818CF8', label: 'Productivity'  },
  utilities:     { color: '#0F0F0F', accent: '#94A3B8', label: 'Utilities'     },
};

const getAccent = (cat: string) => categoryMeta[cat]?.accent ?? '#94A3B8';

export default function PluginsPage() {
  const [plugins, setPlugins]           = useState<Plugin[]>([]);
  const [categories, setCategories]     = useState<Category[]>([]);
  const [featured, setFeatured]         = useState<Plugin[]>([]);
  const [loading, setLoading]           = useState(true);
  const [searchQuery, setSearchQuery]   = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode]         = useState<'grid' | 'list'>('grid');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [catsRes, featRes, allRes] = await Promise.all([
        fetch(`${PLUGIN_REGISTRY_URL}/api/plugins/categories`),
        fetch(`${PLUGIN_REGISTRY_URL}/api/plugins/featured`),
        fetch(`${PLUGIN_REGISTRY_URL}/api/plugins`),
      ]);
      const [catsData, featData, allData] = await Promise.all([
        catsRes.json(), featRes.json(), allRes.json(),
      ]);
      setCategories(catsData.categories || []);
      setFeatured(featData.plugins || []);
      setPlugins(allData.plugins || []);
    } catch (err) {
      console.error('Failed to fetch plugins:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) { fetchData(); return; }
    setLoading(true);
    try {
      const res = await fetch(`${PLUGIN_REGISTRY_URL}/api/plugins/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setPlugins(data.plugins || []);
    } catch (err) { console.error('Search failed:', err); }
    finally { setLoading(false); }
  };

  const handleCategoryFilter = async (category: string | null) => {
    setSelectedCategory(category);
    setLoading(true);
    try {
      const url = category
        ? `${PLUGIN_REGISTRY_URL}/api/plugins?category=${category}`
        : `${PLUGIN_REGISTRY_URL}/api/plugins`;
      const res = await fetch(url);
      const data = await res.json();
      setPlugins(data.plugins || []);
    } catch (err) { console.error('Filter failed:', err); }
    finally { setLoading(false); }
  };

  const clearFilters = () => { setSearchQuery(''); setSelectedCategory(null); fetchData(); };

  const isFiltering = !!(searchQuery || selectedCategory);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-muted/40 rounded-3xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted/40 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-3xl p-6 md:p-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full text-xs font-medium text-primary mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Plugin Store
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-3">
            Extend your <span className="text-primary">Cloud Shakes</span>
          </h1>
          <p className="text-muted-foreground mb-6">
            {plugins.length} plugins available · integrations, automations & more
          </p>

          {/* Search */}
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search plugins..."
              className="w-full bg-background/80 border border-border/60 rounded-xl py-3 pl-11 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={clearFilters}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Categories */}
      {!isFiltering && categories.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Browse by category</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleCategoryFilter(cat.id)}
                className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted border border-border/60 hover:border-border rounded-lg text-sm text-foreground transition-all"
              >
                <span>{cat.icon}</span>
                <span className="font-medium">{cat.name}</span>
                <span className="text-muted-foreground text-xs">{cat.pluginCount}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Featured */}
      {!isFiltering && featured.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Featured</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.slice(0, 6).map((plugin, i) => (
              <FeaturedCard key={plugin.name} plugin={plugin} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* All plugins */}
      <div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isFiltering ? 'Results' : 'All plugins'}
            </h2>
            <span className="px-2 py-0.5 bg-muted/60 rounded text-xs text-muted-foreground">
              {plugins.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isFiltering && (
              <button 
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 hover:bg-muted border border-border/60 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-all"
              >
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
            {selectedCategory && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg text-xs text-primary">
                {categories.find(c => c.id === selectedCategory)?.icon}{' '}
                {categories.find(c => c.id === selectedCategory)?.name}
              </span>
            )}
            <div className="flex bg-muted/50 border border-border/60 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-background shadow-sm' : 'hover:text-foreground text-muted-foreground'}`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-background shadow-sm' : 'hover:text-foreground text-muted-foreground'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {plugins.length === 0 ? (
          <div className="text-center py-16">
            <Search className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-foreground font-medium">No plugins found</p>
            <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {plugins.map(p => <PluginCard key={p.name} plugin={p} />)}
          </div>
        ) : (
          <div className="space-y-2">
            {plugins.map(p => <PluginListRow key={p.name} plugin={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturedCard({ plugin, index }: { plugin: Plugin; index: number }) {
  const accent = getAccent(plugin.category);
  return (
    <Link
      href={`/dashboard/plugins/${plugin.name}`}
      className="group block p-4 bg-muted/30 hover:bg-muted/50 border border-border/60 hover:border-primary/30 rounded-2xl transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-start gap-3 mb-3">
        <PluginIcon plugin={plugin} size={44} />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{plugin.displayName}</h3>
          <p className="text-xs text-muted-foreground truncate">{plugin.author}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
      </div>
      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{plugin.description}</p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-3 border-t border-border/40">
        {plugin.rating > 0 && (
          <span className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" /> {plugin.rating.toFixed(1)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Download className="w-3.5 h-3.5" /> {fmtNum(plugin.downloads)}
        </span>
        {plugin.latestVersion && <span className="text-muted-foreground/70">v{plugin.latestVersion}</span>}
        <span className="ml-auto font-medium text-foreground">{priceLabel(plugin)}</span>
      </div>
    </Link>
  );
}

function PluginCard({ plugin }: { plugin: Plugin }) {
  return (
    <Link
      href={`/dashboard/plugins/${plugin.name}`}
      className="group block p-4 bg-muted/30 hover:bg-muted/50 border border-border/60 hover:border-primary/30 rounded-xl transition-all duration-200 hover:shadow-md"
    >
      <div className="flex items-start gap-3 mb-3">
        <PluginIcon plugin={plugin} size={40} />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{plugin.displayName}</h3>
          <p className="text-xs text-muted-foreground truncate">{plugin.author}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{plugin.description}</p>
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/40">
        <div className="flex items-center gap-2">
          {plugin.rating > 0 && (
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" /> {plugin.rating.toFixed(1)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Download className="w-3 h-3" /> {fmtNum(plugin.downloads)}
          </span>
          {plugin.latestVersion && <span className="text-muted-foreground/70">v{plugin.latestVersion}</span>}
        </div>
        <span className="font-medium text-foreground">{priceLabel(plugin)}</span>
      </div>
    </Link>
  );
}

function PluginListRow({ plugin }: { plugin: Plugin }) {
  return (
    <Link
      href={`/dashboard/plugins/${plugin.name}`}
      className="group flex items-center gap-4 p-3 bg-muted/30 hover:bg-muted/50 border border-border/60 hover:border-primary/30 rounded-xl transition-all duration-200"
    >
      <PluginIcon plugin={plugin} size={36} />
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{plugin.displayName}</h3>
        <p className="text-sm text-muted-foreground truncate">{plugin.description}</p>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {plugin.rating > 0 && (
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" /> {plugin.rating.toFixed(1)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Download className="w-3 h-3" /> {fmtNum(plugin.downloads)}
        </span>
        <span className="px-2 py-1 bg-muted/60 rounded text-xs capitalize">{plugin.category}</span>
        <span className="font-medium text-foreground min-w-[60px] text-right">{priceLabel(plugin)}</span>
      </div>
    </Link>
  );
}

function PluginIcon({ plugin, size }: { plugin: Plugin; size: number }) {
  const accent = getAccent(plugin.category);
  return (
    <div
      className="rounded-lg flex items-center justify-center text-sm font-semibold shrink-0"
      style={{ 
        width: size, 
        height: size, 
        backgroundColor: `${accent}15`,
        color: accent,
        border: `1px solid ${accent}30`
      }}
    >
      {plugin.iconUrl
        ? <img src={plugin.iconUrl} alt={plugin.displayName} className="w-full h-full object-cover rounded-lg" />
        : plugin.displayName.charAt(0).toUpperCase()
      }
    </div>
  );
}

function fmtNum(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function priceLabel(p: Plugin) {
  if (p.pricing?.type === 'free') return 'Free';
  if (p.pricing?.price) return `${p.pricing.currency} ${p.pricing.price}`;
  return '';
}