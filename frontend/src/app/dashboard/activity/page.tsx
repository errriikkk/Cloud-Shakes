'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useAuth } from '@/context/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import axios from 'axios';
import { API_ENDPOINTS } from '@/lib/api';
import { 
    Search, Filter, Calendar, ChevronLeft, ChevronRight, 
    FileText, Folder, StickyNote, Link, MessageSquare, 
    Upload, Download, Trash2, Edit, Plus, User, Clock,
    BarChart3, Activity
} from 'lucide-react';

interface Activity {
    id: string;
    type: string;
    action: string;
    resourceId?: string;
    resourceType?: string;
    resourceName?: string;
    createdAt: string;
    owner: {
        id: string;
        username: string;
        displayName: string;
        avatar?: string;
    };
    metadata?: any;
}

export default function ActivityLogPage() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { canViewActivity } = usePermission();
    
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [showStats, setShowStats] = useState(false);
    
    // Filters
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [actionFilter, setActionFilter] = useState('');
    const [userFilter, setUserFilter] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
    
    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    
    // Filter options
    const [types, setTypes] = useState<string[]>([]);
    const [actions, setActions] = useState<string[]>([]);
    const [users, setUsers] = useState<any[]>([]);

    const fetchActivities = async () => {
        if (!canViewActivity()) return;
        
        setLoading(true);
        try {
            const params: any = {
                page,
                limit: 50,
                sort: sortOrder,
            };
            
            if (search) params.search = search;
            if (typeFilter) params.type = typeFilter;
            if (actionFilter) params.action = actionFilter;
            if (userFilter) params.userId = userFilter;
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;
            
            const res = await axios.get(API_ENDPOINTS.ACTIVITY.BASE, {
                params,
                withCredentials: true
            });
            
            setActivities(res.data.data);
            setTotal(res.data.pagination.total);
            setTotalPages(res.data.pagination.totalPages);
            setTypes(res.data.filters.types || []);
            setActions(res.data.filters.actions || []);
            setUsers(res.data.filters.users || []);
        } catch (err) {
            console.error('Failed to fetch activities:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        if (!canViewActivity()) return;
        
        try {
            const res = await axios.get(`${API_ENDPOINTS.ACTIVITY.BASE}/stats`, {
                params: { days: 30 },
                withCredentials: true
            });
            setStats(res.data);
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        }
    };

    useEffect(() => {
        if (user && canViewActivity()) {
            fetchActivities();
        }
    }, [user, canViewActivity(), page, sortOrder]);

    useEffect(() => {
        // Reset page when filters change
        setPage(1);
    }, [search, typeFilter, actionFilter, userFilter, startDate, endDate]);

    const handleSearch = () => {
        setPage(1);
        fetchActivities();
    };

    const clearFilters = () => {
        setSearch('');
        setTypeFilter('');
        setActionFilter('');
        setUserFilter('');
        setStartDate('');
        setEndDate('');
        setPage(1);
        fetchActivities();
    };

    const getTypeIcon = (type: string) => {
        switch (type?.toLowerCase()) {
            case 'file': return <FileText className="w-4 h-4" />;
            case 'folder': return <Folder className="w-4 h-4" />;
            case 'note': return <StickyNote className="w-4 h-4" />;
            case 'link': return <Link className="w-4 h-4" />;
            case 'chat': case 'conversation': return <MessageSquare className="w-4 h-4" />;
            case 'document': return <FileText className="w-4 h-4" />;
            case 'user': return <User className="w-4 h-4" />;
            default: return <Activity className="w-4 h-4" />;
        }
    };

    const getActionColor = (action: string) => {
        const actionLower = action?.toLowerCase() || '';
        if (actionLower.includes('create') || actionLower.includes('upload')) return 'text-green-500';
        if (actionLower.includes('edit') || actionLower.includes('update') || actionLower.includes('modify')) return 'text-blue-500';
        if (actionLower.includes('delete') || actionLower.includes('remove')) return 'text-red-500';
        if (actionLower.includes('download')) return 'text-purple-500';
        if (actionLower.includes('share') || actionLower.includes('link')) return 'text-orange-500';
        return 'text-muted-foreground';
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleString();
    };

    const formatRelativeTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return t('common.justNow') || 'Just now';
        if (minutes < 60) return `${minutes}m ${t('common.ago') || 'ago'}`;
        if (hours < 24) return `${hours}h ${t('common.ago') || 'ago'}`;
        if (days < 7) return `${days}d ${t('common.ago') || 'ago'}`;
        return formatDate(dateStr);
    };

    if (!user) return null;

    if (!canViewActivity()) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <Activity className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                    <h2 className="text-xl font-semibold">{t('common.accessDenied') || 'Access Denied'}</h2>
                    <p className="text-muted-foreground mt-2">{t('activity.noPermission') || 'You do not have permission to view activity logs'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="border-b border-border/60 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-3">
                                <Activity className="w-7 h-7 text-primary" />
                                {t('activity.title') || 'Activity Log'}
                            </h1>
                            <p className="text-muted-foreground mt-1">
                                {total} {t('activity.events') || 'events'}
                            </p>
                        </div>
                        <button
                            onClick={() => { setShowStats(!showStats); if (!showStats) fetchStats(); }}
                            className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-xl transition-colors"
                        >
                            <BarChart3 className="w-4 h-4" />
                            {t('activity.statistics') || 'Statistics'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Panel */}
            {showStats && stats && (
                <div className="p-6 border-b border-border/60 bg-muted/30">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-card rounded-xl p-4 border border-border/60">
                            <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('activity.totalActivity') || 'Total Activity'}</h3>
                            <p className="text-3xl font-bold">{stats.total}</p>
                        </div>
                        <div className="bg-card rounded-xl p-4 border border-border/60">
                            <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('activity.byType') || 'By Type'}</h3>
                            <div className="space-y-1">
                                {stats.byType?.slice(0, 3).map((t: any) => (
                                    <div key={t.type} className="flex justify-between text-sm">
                                        <span className="capitalize">{t.type}</span>
                                        <span className="font-medium">{t.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="bg-card rounded-xl p-4 border border-border/60">
                            <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('activity.byAction') || 'By Action'}</h3>
                            <div className="space-y-1">
                                {stats.byAction?.slice(0, 3).map((a: any) => (
                                    <div key={a.action} className="flex justify-between text-sm">
                                        <span className="capitalize">{a.action}</span>
                                        <span className="font-medium">{a.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="bg-card rounded-xl p-4 border border-border/60">
                            <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('activity.topUsers') || 'Top Users'}</h3>
                            <div className="space-y-1">
                                {stats.topUsers?.slice(0, 3).map((u: any) => (
                                    <div key={u.userId} className="flex justify-between text-sm">
                                        <span className="truncate">{u.user?.displayName || u.user?.username}</span>
                                        <span className="font-medium">{u.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="p-6 border-b border-border/60">
                <div className="flex flex-wrap gap-4">
                    {/* Search */}
                    <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder={t('activity.search') || 'Search activities...'}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="w-full pl-9 pr-4 py-2 bg-muted/50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30"
                            />
                        </div>
                    </div>

                    {/* Type Filter */}
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="px-4 py-2 bg-muted/50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    >
                        <option value="">{t('activity.allTypes') || 'All Types'}</option>
                        {types.map(t => (
                            <option key={t} value={t} className="capitalize">{t}</option>
                        ))}
                    </select>

                    {/* Action Filter */}
                    <select
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                        className="px-4 py-2 bg-muted/50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    >
                        <option value="">{t('activity.allActions') || 'All Actions'}</option>
                        {actions.map(a => (
                            <option key={a} value={a} className="capitalize">{a}</option>
                        ))}
                    </select>

                    {/* User Filter */}
                    <select
                        value={userFilter}
                        onChange={(e) => setUserFilter(e.target.value)}
                        className="px-4 py-2 bg-muted/50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    >
                        <option value="">{t('activity.allUsers') || 'All Users'}</option>
                        {users.map(u => (
                            <option key={u.id} value={u.id}>{u.displayName || u.username}</option>
                        ))}
                    </select>

                    {/* Date Range */}
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="px-3 py-2 bg-muted/50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <span className="text-muted-foreground">-</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="px-3 py-2 bg-muted/50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        />
                    </div>

                    {/* Sort */}
                    <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
                        className="px-4 py-2 bg-muted/50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    >
                        <option value="desc">{t('activity.newestFirst') || 'Newest First'}</option>
                        <option value="asc">{t('activity.oldestFirst') || 'Oldest First'}</option>
                    </select>

                    {/* Clear Filters */}
                    <button
                        onClick={clearFilters}
                        className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {t('common.clear') || 'Clear'}
                    </button>
                </div>
            </div>

            {/* Activity List */}
            <div className="p-6">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : activities.length === 0 ? (
                    <div className="text-center py-12">
                        <Activity className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
                        <p className="text-muted-foreground">{t('activity.noActivity') || 'No activity found'}</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {activities.map((activity) => (
                            <div
                                key={activity.id}
                                className="flex items-start gap-4 p-4 bg-card/50 rounded-xl border border-border/40 hover:bg-card transition-colors"
                            >
                                {/* Icon */}
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                                    {getTypeIcon(activity.type)}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium">{activity.owner.displayName || activity.owner.username}</span>
                                        <span className={`text-sm capitalize ${getActionColor(activity.action)}`}>
                                            {activity.action}
                                        </span>
                                        {activity.resourceName && (
                                            <span className="text-muted-foreground truncate max-w-[200px]">
                                                {activity.resourceName}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                                        <span className="capitalize">{activity.type}</span>
                                        {activity.resourceType && (
                                            <>
                                                <span>•</span>
                                                <span className="capitalize">{activity.resourceType}</span>
                                            </>
                                        )}
                                        <span>•</span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {formatRelativeTime(activity.createdAt)}
                                        </span>
                                    </div>
                                </div>

                                {/* Timestamp */}
                                <div className="text-xs text-muted-foreground shrink-0">
                                    {formatDate(activity.createdAt)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6 pt-6 border-t border-border/60">
                        <p className="text-sm text-muted-foreground">
                            {t('common.page') || 'Page'} {page} {t('common.of') || 'of'} {totalPages}
                            {' '}({total} {t('activity.events') || 'events'})
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="p-2 rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="p-2 rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
