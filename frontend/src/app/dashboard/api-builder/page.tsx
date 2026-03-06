"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import { 
    Code, Play, Save, Trash2, Plus, FileText, Database, 
    ArrowRight, Settings, Zap, Globe, Lock, Copy, Check,
    File, Folder, Shield, Clock, Users, Link as LinkIcon, X, Edit2,
    Book, Terminal, Pause, PlayCircle, Search, PlusCircle, Edit, Minus,
    Filter, ArrowUpDown, Layers, Merge, UnfoldVertical, Hash, Calculator,
    Calendar, CheckCircle, XCircle, AlertCircle, Variable, Repeat,
    RotateCcw, Key, Mail, Send, ArrowRightCircle, Cookie, Archive,
    Lock as LockIcon, RefreshCw, List, Grid, BarChart, TrendingUp,
    Type, Scissors, Link2, Eye, EyeOff, Shuffle, GitBranch, GitMerge
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import axios from "axios";
import { API_ENDPOINTS } from "@/lib/api";
import { useModal } from "@/hooks/useModal";

interface ApiBlock {
    id: string; // Unique ID for this block instance
    blockType?: string; // Type of block: 'file-read', 'file-list', etc.
    type: 'trigger' | 'action' | 'condition' | 'data';
    name: string;
    icon: any;
    color: string;
    config?: {
        // File operations
        fileId?: string;
        fileName?: string;
        folderId?: string;
        fileContent?: string;
        // Data transform
        transformType?: string;
        // Condition
        conditionField?: string;
        conditionValue?: string;
        conditionOperator?: string;
        // Response
        responseFormat?: 'json' | 'file' | 'text';
        statusCode?: number;
        // Custom code
        code?: string;
        // HTTP request
        url?: string;
        method?: string;
        headers?: any;
        body?: string;
        timeout?: number;
        // Delay
        delay?: number;
        // Database
        dbModel?: string;
        dbQuery?: string;
        dbWhere?: any;
        dbData?: any;
        // Array/Object operations
        mapFunction?: string;
        filterFunction?: string;
        reduceFunction?: string;
        reduceInitial?: any;
        sortField?: string;
        sortOrder?: 'asc' | 'desc';
        groupField?: string;
        mergeObjects?: any[];
        pickFields?: string[];
        // String operations
        replacePattern?: string;
        replaceValue?: string;
        splitDelimiter?: string;
        joinDelimiter?: string;
        regexPattern?: string;
        regexFlags?: string;
        // Math
        mathExpression?: string;
        roundDecimals?: number;
        randomMin?: number;
        randomMax?: number;
        // Date
        dateFormat?: string;
        dateInput?: string;
        dateAddValue?: number;
        dateAddUnit?: 'ms' | 's' | 'm' | 'h' | 'd' | 'M' | 'y';
        // Validation
        validationSchema?: any;
        validationRules?: any;
        // Variables
        variableName?: string;
        variableValue?: any;
        // Loops
        loopArray?: string;
        loopFunction?: string;
        // Switch
        switchField?: string;
        switchCases?: any;
        // Error handling
        errorMessage?: string;
        // Encoding
        encodeType?: 'base64' | 'url' | 'uri';
        hashAlgorithm?: 'md5' | 'sha256' | 'sha512';
        // Cache
        cacheKey?: string;
        cacheValue?: any;
        cacheTtl?: number;
        // Webhook/Email
        webhookUrl?: string;
        emailTo?: string;
        emailSubject?: string;
        emailBody?: string;
        // Redirect
        redirectUrl?: string;
        redirectCode?: number;
        // Cookie
        cookieName?: string;
        cookieValue?: string;
        cookieOptions?: any;
        // Compression
        compressionType?: 'gzip' | 'deflate';
        // Encryption
        encryptionKey?: string;
        encryptionAlgorithm?: 'aes-256-cbc';
    };
}

interface ApiPolicy {
    requireAuth: boolean;
    rateLimit: number; // requests per minute
    allowedOrigins: string[];
    requirePassword: boolean;
    password?: string;
    maxFileSize?: number;
    allowedMimeTypes?: string[];
}

interface ApiFlow {
    id: string;
    name: string;
    description: string;
    blocks: ApiBlock[];
    endpoint?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    deployed?: boolean;
    apiKey?: string;
    apiUrl?: string;
    policies: ApiPolicy;
    selectedFiles: string[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function ApiBuilderPage() {
    const { user } = useAuth();
    const { alert, confirm, ModalComponents } = useModal();
    const [mounted, setMounted] = useState(false);
    const [flows, setFlows] = useState<ApiFlow[]>([]);
    const [selectedFlow, setSelectedFlow] = useState<ApiFlow | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isEditingBlock, setIsEditingBlock] = useState<string | null>(null);
    const [isSelectingFiles, setIsSelectingFiles] = useState(false);
    const [availableFiles, setAvailableFiles] = useState<any[]>([]);
    const [newFlowName, setNewFlowName] = useState("");
    const [loading, setLoading] = useState(false);
    const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
    const [showDocs, setShowDocs] = useState(false);
    const [consoleLogs, setConsoleLogs] = useState<Array<{ type: 'log' | 'error' | 'warn', message: string, timestamp: Date }>>([]);
    const [previewData, setPreviewData] = useState<any>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Prevent body scroll when file selector modal is open
    useEffect(() => {
        if (isSelectingFiles) {
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        };
    }, [isSelectingFiles]);

    const blockTypes: ApiBlock[] = [
        // File Operations
        { id: 'file-read', type: 'action', name: 'Leer Archivo', icon: FileText, color: 'bg-blue-500' },
        { id: 'file-list', type: 'action', name: 'Listar Archivos', icon: Database, color: 'bg-green-500' },
        { id: 'file-send', type: 'action', name: 'Enviar Archivo', icon: File, color: 'bg-purple-500' },
        { id: 'file-write', type: 'action', name: 'Escribir Archivo', icon: FileText, color: 'bg-blue-600' },
        { id: 'file-delete', type: 'action', name: 'Eliminar Archivo', icon: Trash2, color: 'bg-red-500' },
        
        // Database Operations
        { id: 'db-query', type: 'action', name: 'Query DB', icon: Search, color: 'bg-emerald-500' },
        { id: 'db-insert', type: 'action', name: 'Insertar DB', icon: PlusCircle, color: 'bg-emerald-600' },
        { id: 'db-update', type: 'action', name: 'Actualizar DB', icon: Edit, color: 'bg-emerald-700' },
        { id: 'db-delete', type: 'action', name: 'Eliminar DB', icon: Minus, color: 'bg-emerald-800' },
        
        // Array/Object Operations
        { id: 'array-map', type: 'data', name: 'Map Array', icon: Layers, color: 'bg-violet-500' },
        { id: 'array-filter', type: 'data', name: 'Filtrar Array', icon: Filter, color: 'bg-violet-600' },
        { id: 'array-reduce', type: 'data', name: 'Reducir Array', icon: TrendingUp, color: 'bg-violet-700' },
        { id: 'array-sort', type: 'data', name: 'Ordenar Array', icon: ArrowUpDown, color: 'bg-violet-800' },
        { id: 'array-group', type: 'data', name: 'Agrupar Array', icon: Grid, color: 'bg-violet-900' },
        { id: 'object-merge', type: 'data', name: 'Fusionar Objetos', icon: Merge, color: 'bg-pink-500' },
        { id: 'object-flatten', type: 'data', name: 'Aplanar Objeto', icon: UnfoldVertical, color: 'bg-pink-600' },
        { id: 'object-pick', type: 'data', name: 'Seleccionar Campos', icon: List, color: 'bg-pink-700' },
        
        // String Operations
        { id: 'string-replace', type: 'data', name: 'Reemplazar Texto', icon: RotateCcw, color: 'bg-teal-500' },
        { id: 'string-split', type: 'data', name: 'Dividir Texto', icon: Scissors, color: 'bg-teal-600' },
        { id: 'string-join', type: 'data', name: 'Unir Texto', icon: Link2, color: 'bg-teal-700' },
        { id: 'string-regex', type: 'data', name: 'Regex Match', icon: Hash, color: 'bg-teal-800' },
        { id: 'string-encode', type: 'data', name: 'Codificar', icon: Eye, color: 'bg-amber-500' },
        { id: 'string-decode', type: 'data', name: 'Decodificar', icon: EyeOff, color: 'bg-amber-600' },
        
        // Math Operations
        { id: 'math-calculate', type: 'data', name: 'Calcular', icon: Calculator, color: 'bg-slate-500' },
        { id: 'math-round', type: 'data', name: 'Redondear', icon: BarChart, color: 'bg-slate-600' },
        { id: 'math-random', type: 'data', name: 'Número Aleatorio', icon: Shuffle, color: 'bg-slate-700' },
        
        // Date/Time Operations
        { id: 'date-format', type: 'data', name: 'Formatear Fecha', icon: Calendar, color: 'bg-rose-500' },
        { id: 'date-parse', type: 'data', name: 'Parsear Fecha', icon: Calendar, color: 'bg-rose-600' },
        { id: 'date-add', type: 'data', name: 'Sumar Tiempo', icon: Clock, color: 'bg-rose-700' },
        
        // Validation
        { id: 'validate-schema', type: 'condition', name: 'Validar Schema', icon: CheckCircle, color: 'bg-lime-500' },
        { id: 'validate-data', type: 'condition', name: 'Validar Datos', icon: XCircle, color: 'bg-lime-600' },
        
        // Variables & State
        { id: 'set-variable', type: 'action', name: 'Establecer Variable', icon: Variable, color: 'bg-fuchsia-500' },
        { id: 'get-variable', type: 'action', name: 'Obtener Variable', icon: Variable, color: 'bg-fuchsia-600' },
        
        // Loops & Control Flow
        { id: 'loop-foreach', type: 'action', name: 'For Each', icon: Repeat, color: 'bg-cyan-600' },
        { id: 'switch-case', type: 'condition', name: 'Switch Case', icon: GitBranch, color: 'bg-cyan-700' },
        
        // Error Handling
        { id: 'try-catch', type: 'action', name: 'Try/Catch', icon: AlertCircle, color: 'bg-red-600' },
        { id: 'throw-error', type: 'action', name: 'Lanzar Error', icon: XCircle, color: 'bg-red-700' },
        
        // Encoding/Decoding
        { id: 'encode-base64', type: 'data', name: 'Base64 Encode', icon: LockIcon, color: 'bg-indigo-600' },
        { id: 'decode-base64', type: 'data', name: 'Base64 Decode', icon: LockIcon, color: 'bg-indigo-700' },
        { id: 'hash-md5', type: 'data', name: 'Hash MD5', icon: Hash, color: 'bg-indigo-800' },
        { id: 'hash-sha256', type: 'data', name: 'Hash SHA256', icon: Hash, color: 'bg-indigo-900' },
        
        // Cache
        { id: 'cache-set', type: 'action', name: 'Guardar Cache', icon: Save, color: 'bg-yellow-600' },
        { id: 'cache-get', type: 'action', name: 'Obtener Cache', icon: RefreshCw, color: 'bg-yellow-700' },
        
        // Network & Communication
        { id: 'http-request', type: 'action', name: 'HTTP Request', icon: Globe, color: 'bg-cyan-500' },
        { id: 'webhook-send', type: 'action', name: 'Enviar Webhook', icon: Send, color: 'bg-orange-500' },
        { id: 'email-send', type: 'action', name: 'Enviar Email', icon: Mail, color: 'bg-blue-600' },
        
        // Response & Control
        { id: 'redirect', type: 'action', name: 'Redirigir', icon: ArrowRightCircle, color: 'bg-green-600' },
        { id: 'set-cookie', type: 'action', name: 'Establecer Cookie', icon: Cookie, color: 'bg-amber-700' },
        { id: 'get-cookie', type: 'action', name: 'Obtener Cookie', icon: Cookie, color: 'bg-amber-800' },
        
        // Compression
        { id: 'compress', type: 'data', name: 'Comprimir', icon: Archive, color: 'bg-purple-600' },
        { id: 'decompress', type: 'data', name: 'Descomprimir', icon: UnfoldVertical, color: 'bg-purple-700' },
        
        // Encryption
        { id: 'encrypt', type: 'data', name: 'Encriptar', icon: LockIcon, color: 'bg-red-800' },
        { id: 'decrypt', type: 'data', name: 'Desencriptar', icon: Key, color: 'bg-red-900' },
        
        // Existing blocks
        { id: 'data-transform', type: 'data', name: 'Transformar Datos', icon: Zap, color: 'bg-yellow-500' },
        { id: 'condition', type: 'condition', name: 'Condición', icon: Settings, color: 'bg-orange-500' },
        { id: 'custom-code', type: 'action', name: 'Código Personalizado', icon: Code, color: 'bg-indigo-500' },
        { id: 'delay', type: 'action', name: 'Esperar', icon: Clock, color: 'bg-gray-500' },
        { id: 'response', type: 'action', name: 'Responder', icon: Globe, color: 'bg-primary' },
    ];

    // Helper function to safely get block icon component
    const getBlockIcon = (blockId: string): any => {
        const blockType = blockTypes.find(bt => bt.id === blockId);
        return blockType?.icon || FileText; // Default icon
    };

    // Organize blocks by categories
    const blockCategories = [
        {
            id: 'files',
            name: 'Archivos',
            icon: File,
            blocks: blockTypes.filter(b => b.id.startsWith('file-')),
        },
        {
            id: 'database',
            name: 'Base de Datos',
            icon: Database,
            blocks: blockTypes.filter(b => b.id.startsWith('db-')),
        },
        {
            id: 'arrays',
            name: 'Arrays & Objetos',
            icon: Layers,
            blocks: blockTypes.filter(b => b.id.startsWith('array-') || b.id.startsWith('object-')),
        },
        {
            id: 'strings',
            name: 'Texto',
            icon: Type,
            blocks: blockTypes.filter(b => b.id.startsWith('string-')),
        },
        {
            id: 'math',
            name: 'Matemáticas',
            icon: Calculator,
            blocks: blockTypes.filter(b => b.id.startsWith('math-')),
        },
        {
            id: 'dates',
            name: 'Fechas',
            icon: Calendar,
            blocks: blockTypes.filter(b => b.id.startsWith('date-')),
        },
        {
            id: 'validation',
            name: 'Validación',
            icon: CheckCircle,
            blocks: blockTypes.filter(b => b.id.startsWith('validate-')),
        },
        {
            id: 'variables',
            name: 'Variables',
            icon: Variable,
            blocks: blockTypes.filter(b => b.id.includes('variable')),
        },
        {
            id: 'control',
            name: 'Control de Flujo',
            icon: GitBranch,
            blocks: blockTypes.filter(b => b.id.startsWith('loop-') || b.id.startsWith('switch-') || b.id === 'condition'),
        },
        {
            id: 'errors',
            name: 'Errores',
            icon: AlertCircle,
            blocks: blockTypes.filter(b => b.id.startsWith('try-') || b.id.startsWith('throw-')),
        },
        {
            id: 'encoding',
            name: 'Codificación',
            icon: LockIcon,
            blocks: blockTypes.filter(b => b.id.includes('encode') || b.id.includes('decode') || b.id.includes('hash-')),
        },
        {
            id: 'cache',
            name: 'Cache',
            icon: Save,
            blocks: blockTypes.filter(b => b.id.startsWith('cache-')),
        },
        {
            id: 'network',
            name: 'Red',
            icon: Globe,
            blocks: blockTypes.filter(b => b.id.startsWith('http-') || b.id.startsWith('webhook-') || b.id.startsWith('email-')),
        },
        {
            id: 'response',
            name: 'Respuesta',
            icon: ArrowRightCircle,
            blocks: blockTypes.filter(b => b.id === 'response' || b.id === 'redirect' || b.id.includes('cookie')),
        },
        {
            id: 'compression',
            name: 'Compresión',
            icon: Archive,
            blocks: blockTypes.filter(b => b.id === 'compress' || b.id === 'decompress'),
        },
        {
            id: 'encryption',
            name: 'Encriptación',
            icon: Key,
            blocks: blockTypes.filter(b => b.id === 'encrypt' || b.id === 'decrypt'),
        },
        {
            id: 'transform',
            name: 'Transformación',
            icon: Zap,
            blocks: blockTypes.filter(b => b.id === 'data-transform'),
        },
        {
            id: 'custom',
            name: 'Personalizado',
            icon: Code,
            blocks: blockTypes.filter(b => b.id === 'custom-code' || b.id === 'delay'),
        },
    ];

    // Drag and drop handlers
    const [draggedBlock, setDraggedBlock] = useState<ApiBlock | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('files');

    useEffect(() => {
        // Load saved flows from backend
        const loadFlows = async () => {
            if (!user) return;
            try {
                const res = await axios.get(`${API_BASE}/api/api-flows`, { withCredentials: true });
                // Ensure all fields are properly parsed and converted
                const flows = res.data.map((flow: any) => {
                    // Parse JSON fields if they're strings
                    let blocks = flow.blocks;
                    if (typeof blocks === 'string') {
                        try {
                            blocks = JSON.parse(blocks);
                        } catch {
                            blocks = [];
                        }
                    }
                    if (!Array.isArray(blocks)) blocks = [];
                    // Restore icon components for blocks and ensure blockType is set
                    blocks = blocks.map((block: any) => {
                        // Try to find block type by blockType field, or by id (for backwards compatibility)
                        const blockTypeId = block.blockType || block.id;
                        const blockType = blockTypes.find(bt => bt.id === blockTypeId);
                        return {
                            ...block,
                            blockType: blockTypeId, // Ensure blockType is set
                            icon: blockType?.icon || block.icon,
                            name: blockType?.name || block.name,
                            color: blockType?.color || block.color,
                        };
                    });

                    let policies = flow.policies;
                    if (typeof policies === 'string') {
                        try {
                            policies = JSON.parse(policies);
                        } catch {
                            policies = {};
                        }
                    }
                    if (!policies || typeof policies !== 'object') {
                        policies = {
                            requireAuth: false,
                            rateLimit: 60,
                            allowedOrigins: [],
                            requirePassword: false,
                            maxFileSize: 100 * 1024 * 1024,
                            allowedMimeTypes: [],
                        };
                    }
                    // Ensure allowedOrigins is an array
                    if (!Array.isArray(policies.allowedOrigins)) {
                        policies.allowedOrigins = [];
                    }

                    let selectedFiles = flow.selectedFiles;
                    if (typeof selectedFiles === 'string') {
                        try {
                            selectedFiles = JSON.parse(selectedFiles);
                        } catch {
                            selectedFiles = [];
                        }
                    }
                    if (!Array.isArray(selectedFiles)) selectedFiles = [];

                    return {
                        ...flow,
                        blocks,
                        policies,
                        selectedFiles,
                        apiUrl: flow.apiUrl ? String(flow.apiUrl) : null,
                        apiKey: flow.apiKey ? String(flow.apiKey) : null,
                        endpoint: flow.endpoint ? String(flow.endpoint) : '',
                        method: flow.method || 'GET',
                    };
                });
                setFlows(flows);
            } catch (err) {
                console.error('Failed to load flows:', err);
            }
        };
        loadFlows();
    }, [user]);

    useEffect(() => {
        // Load available files
        if (isSelectingFiles && user) {
            axios.get(API_ENDPOINTS.FILES.BASE, { withCredentials: true })
                .then(res => setAvailableFiles(res.data))
                .catch(err => console.error('Failed to load files:', err));
        }
    }, [isSelectingFiles, user]);

    const handleCreateFlow = async () => {
        if (!newFlowName.trim()) return;
        
        setLoading(true);
        try {
            const res = await axios.post(`${API_BASE}/api/api-flows`, {
            name: newFlowName,
            description: '',
            blocks: [],
            method: 'GET',
            policies: {
                requireAuth: false,
                rateLimit: 60,
                allowedOrigins: [],
                requirePassword: false,
                maxFileSize: 100 * 1024 * 1024, // 100MB
                allowedMimeTypes: [],
            },
            selectedFiles: [],
            }, { withCredentials: true });
            
            // Parse and normalize the new flow
            let blocks = res.data.blocks;
            if (typeof blocks === 'string') {
                try {
                    blocks = JSON.parse(blocks);
                } catch {
                    blocks = [];
                }
            }
            if (!Array.isArray(blocks)) blocks = [];
            // Restore icon components for blocks and ensure blockType is set
            blocks = blocks.map((block: any) => {
                // Try to find block type by blockType field, or by id (for backwards compatibility)
                const blockTypeId = block.blockType || block.id;
                const blockType = blockTypes.find(bt => bt.id === blockTypeId);
                return {
                    ...block,
                    blockType: blockTypeId, // Ensure blockType is set
                    icon: blockType?.icon || block.icon,
                    name: blockType?.name || block.name,
                    color: blockType?.color || block.color,
                };
            });

            let policies = res.data.policies;
            if (typeof policies === 'string') {
                try {
                    policies = JSON.parse(policies);
                } catch {
                    policies = {};
                }
            }
            if (!policies || typeof policies !== 'object') {
                policies = {
                    requireAuth: false,
                    rateLimit: 60,
                    allowedOrigins: [],
                    requirePassword: false,
                    maxFileSize: 100 * 1024 * 1024,
                    allowedMimeTypes: [],
                };
            }
            if (!Array.isArray(policies.allowedOrigins)) {
                policies.allowedOrigins = [];
            }

            let selectedFiles = res.data.selectedFiles;
            if (typeof selectedFiles === 'string') {
                try {
                    selectedFiles = JSON.parse(selectedFiles);
                } catch {
                    selectedFiles = [];
                }
            }
            if (!Array.isArray(selectedFiles)) selectedFiles = [];

            const newFlow = {
                ...res.data,
                blocks,
                policies,
                selectedFiles,
                apiUrl: res.data.apiUrl ? String(res.data.apiUrl) : null,
                apiKey: res.data.apiKey ? String(res.data.apiKey) : null,
                endpoint: res.data.endpoint ? String(res.data.endpoint) : '',
                method: res.data.method || 'GET',
            };
        setFlows([...flows, newFlow]);
        setSelectedFlow(newFlow);
        setNewFlowName("");
        setIsCreating(false);
        } catch (err) {
            console.error('Failed to create flow:', err);
            await alert('Error', 'Error al crear el flujo', { type: 'danger' });
        } finally {
            setLoading(false);
        }
    };

    const handleAddBlock = async (blockType: ApiBlock) => {
        if (!selectedFlow) return;
        
        const newBlock: ApiBlock = {
            ...blockType,
            id: Date.now().toString(),
            blockType: blockType.id, // Save the block type ID
            config: {},
        };
        
        const updatedFlow = {
            ...selectedFlow,
            blocks: [...selectedFlow.blocks, newBlock],
        };
        
        try {
            await axios.put(`${API_BASE}/api/api-flows/${selectedFlow.id}`, {
                blocks: updatedFlow.blocks,
            }, { withCredentials: true });
        
        setSelectedFlow(updatedFlow);
        setFlows(flows.map(f => f.id === updatedFlow.id ? updatedFlow : f));
        } catch (err) {
            console.error('Failed to update flow:', err);
        }
    };

    const handleEditBlock = (blockId: string) => {
        setIsEditingBlock(blockId);
    };

    const handleUpdateBlock = async (blockId: string, config: any) => {
        if (!selectedFlow) return;
        
        const updatedFlow = {
            ...selectedFlow,
            blocks: selectedFlow.blocks.map(b => {
                if (b.id === blockId) {
                    return { 
                        ...b, 
                        config: { ...b.config, ...config },
                        // Ensure blockType is preserved
                        blockType: b.blockType || b.id
                    };
                }
                return b;
            }),
        };
        
        try {
            await axios.put(`${API_BASE}/api/api-flows/${selectedFlow.id}`, {
                blocks: updatedFlow.blocks,
            }, { withCredentials: true });
        
        setSelectedFlow(updatedFlow);
        setFlows(flows.map(f => f.id === updatedFlow.id ? updatedFlow : f));
        setIsEditingBlock(null);
        } catch (err) {
            console.error('Failed to update flow:', err);
        }
    };

    const handleRemoveBlock = async (blockId: string) => {
        if (!selectedFlow) return;
        
        const updatedFlow = {
            ...selectedFlow,
            blocks: selectedFlow.blocks.filter(b => b.id !== blockId),
        };
        
        try {
            await axios.put(`${API_BASE}/api/api-flows/${selectedFlow.id}`, {
                blocks: updatedFlow.blocks,
            }, { withCredentials: true });
        
        setSelectedFlow(updatedFlow);
        setFlows(flows.map(f => f.id === updatedFlow.id ? updatedFlow : f));
        } catch (err) {
            console.error('Failed to update flow:', err);
        }
    };

    const handleDeploy = async (flow: ApiFlow) => {
        if (!flow.endpoint || !flow.method) {
            await alert('Configuración Incompleta', 'Configura el endpoint y método antes de desplegar', { type: 'warning' });
            return;
        }
        
        setLoading(true);
        try {
            // Validate endpoint format
            if (!flow.endpoint.startsWith('/')) {
                await alert('Endpoint Inválido', 'El endpoint debe comenzar con /', { type: 'warning' });
                setLoading(false);
                return;
            }
            
            const res = await axios.put(`${API_BASE}/api/api-flows/${flow.id}`, {
                endpoint: flow.endpoint,
                method: flow.method,
                deployed: true,
                blocks: flow.blocks, // Ensure blocks are saved
                policies: flow.policies,
                selectedFiles: flow.selectedFiles,
            }, { withCredentials: true });
            
            // Parse and normalize the updated flow
            let blocks = res.data.blocks;
            if (typeof blocks === 'string') {
                try {
                    blocks = JSON.parse(blocks);
                } catch {
                    blocks = [];
                }
            }
            if (!Array.isArray(blocks)) blocks = [];
            // Restore icon components for blocks and ensure blockType is set
            blocks = blocks.map((block: any) => {
                // Try to find block type by blockType field, or by id (for backwards compatibility)
                const blockTypeId = block.blockType || block.id;
                const blockType = blockTypes.find(bt => bt.id === blockTypeId);
                return {
                    ...block,
                    blockType: blockTypeId, // Ensure blockType is set
                    icon: blockType?.icon || block.icon,
                    name: blockType?.name || block.name,
                    color: blockType?.color || block.color,
                };
            });

            let policies = res.data.policies;
            if (typeof policies === 'string') {
                try {
                    policies = JSON.parse(policies);
                } catch {
                    policies = {};
                }
            }
            if (!policies || typeof policies !== 'object') {
                policies = {
                    requireAuth: false,
                    rateLimit: 60,
                    allowedOrigins: [],
                    requirePassword: false,
                    maxFileSize: 100 * 1024 * 1024,
                    allowedMimeTypes: [],
                };
            }
            if (!Array.isArray(policies.allowedOrigins)) {
                policies.allowedOrigins = [];
            }

            let selectedFiles = res.data.selectedFiles;
            if (typeof selectedFiles === 'string') {
                try {
                    selectedFiles = JSON.parse(selectedFiles);
                } catch {
                    selectedFiles = [];
                }
            }
            if (!Array.isArray(selectedFiles)) selectedFiles = [];

            const updatedFlow = {
                ...res.data,
                blocks,
                policies,
                selectedFiles,
                apiUrl: res.data.apiUrl ? String(res.data.apiUrl) : null,
                apiKey: res.data.apiKey ? String(res.data.apiKey) : null,
                endpoint: res.data.endpoint ? String(res.data.endpoint) : '',
                method: res.data.method || 'GET',
            };
            
            setFlows(flows.map(f => f.id === flow.id ? updatedFlow : f));
            if (selectedFlow?.id === flow.id) {
                setSelectedFlow(updatedFlow);
            }
            
            await alert('Éxito', 'API desplegada exitosamente', { type: 'success' });
        } catch (err: any) {
            console.error("Deploy failed:", err);
            const errorMsg = err.response?.data?.message || 'Error al desplegar la API';
            await alert('Error', errorMsg, { type: 'danger' });
        } finally {
            setLoading(false);
        }
    };

    const handleUndeploy = async (flow: ApiFlow) => {
        const confirmed = await confirm(
            'Desactivar API',
            '¿Estás seguro de que quieres desactivar esta API? Podrás reactivarla más tarde.',
            { type: 'warning', confirmText: 'Desactivar', cancelText: 'Cancelar' }
        );
        if (!confirmed) return;

        setLoading(true);
        try {
            const res = await axios.put(`${API_BASE}/api/api-flows/${flow.id}`, {
                deployed: false,
            }, { withCredentials: true });
            
            const updatedFlow = {
                ...res.data,
                apiUrl: res.data.apiUrl ? String(res.data.apiUrl) : null,
                apiKey: res.data.apiKey ? String(res.data.apiKey) : null,
            };
            
            setFlows(flows.map(f => f.id === flow.id ? updatedFlow : f));
            if (selectedFlow?.id === flow.id) {
                setSelectedFlow(updatedFlow);
            }
            
            await alert('Éxito', 'API desactivada exitosamente', { type: 'success' });
        } catch (err: any) {
            console.error("Undeploy failed:", err);
            const errorMsg = err.response?.data?.message || 'Error al desactivar la API';
            await alert('Error', errorMsg, { type: 'danger' });
        } finally {
            setLoading(false);
        }
    };

    const handleCopyUrl = (url: string) => {
        navigator.clipboard.writeText(url);
        setCopiedUrl(url);
        setTimeout(() => setCopiedUrl(null), 2000);
    };

    const handlePreview = async () => {
        if (!selectedFlow || !selectedFlow.blocks || selectedFlow.blocks.length === 0) {
            await alert('Sin Bloques', 'Añade al menos un bloque para previsualizar', { type: 'warning' });
            return;
        }

        setPreviewLoading(true);
        setPreviewError(null);
        setPreviewData(null);

        try {
            // Send blocks to backend for execution
            const res = await axios.post(`${API_BASE}/api/api-flows/preview`, {
                blocks: selectedFlow.blocks,
                selectedFiles: selectedFlow.selectedFiles,
                method: selectedFlow.method || 'GET',
            }, { withCredentials: true });

            if (res.data.success) {
                setPreviewData(res.data.data);
            } else {
                setPreviewError(res.data.error || 'Error al ejecutar el preview');
            }
        } catch (err: any) {
            console.error('Preview failed:', err);
            setPreviewError(err.response?.data?.error || err.response?.data?.message || err.message || 'Error al ejecutar el preview');
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleDeleteFlow = async (flowId: string) => {
        const confirmed = await confirm(
            'Eliminar Flujo de API',
            '¿Estás seguro de que quieres eliminar este flujo de API? Esta acción no se puede deshacer.',
            { type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }
        );
        if (!confirmed) return;
        
        try {
            await axios.delete(`${API_BASE}/api/api-flows/${flowId}`, { withCredentials: true });
            
            const updatedFlows = flows.filter(f => f.id !== flowId);
            setFlows(updatedFlows);
            if (selectedFlow?.id === flowId) {
                setSelectedFlow(null);
            }
        } catch (err) {
            console.error("Delete failed:", err);
            await alert('Error', 'Error al eliminar el flujo', { type: 'danger' });
        }
    };

    const handleToggleFile = async (fileId: string) => {
        if (!selectedFlow) return;
        
        const isSelected = selectedFlow.selectedFiles.includes(fileId);
        const updatedFiles = isSelected
            ? selectedFlow.selectedFiles.filter(id => id !== fileId)
            : [...selectedFlow.selectedFiles, fileId];
        
        const updatedFlow = {
            ...selectedFlow,
            selectedFiles: updatedFiles,
        };
        
        try {
            await axios.put(`${API_BASE}/api/api-flows/${selectedFlow.id}`, {
                selectedFiles: updatedFiles,
            }, { withCredentials: true });
        
        setSelectedFlow(updatedFlow);
        setFlows(flows.map(f => f.id === updatedFlow.id ? updatedFlow : f));
        } catch (err) {
            console.error('Failed to update flow:', err);
        }
    };

    const handleUpdatePolicies = async (policies: Partial<ApiPolicy>) => {
        if (!selectedFlow) return;
        
        const updatedPolicies = { ...selectedFlow.policies, ...policies };
        const updatedFlow = {
            ...selectedFlow,
            policies: updatedPolicies,
        };
        
        try {
            await axios.put(`${API_BASE}/api/api-flows/${selectedFlow.id}`, {
                policies: updatedPolicies,
            }, { withCredentials: true });
        
        setSelectedFlow(updatedFlow);
        setFlows(flows.map(f => f.id === updatedFlow.id ? updatedFlow : f));
        } catch (err) {
            console.error('Failed to update flow:', err);
        }
    };

    return (
        <>
            <ModalComponents />
            <div className="space-y-8 w-full max-w-full">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-extrabold text-foreground tracking-tightest">
                        Constructor de APIs
                    </h1>
                    <p className="text-muted-foreground mt-2 text-sm font-medium">
                        Construye APIs visualmente para acceder a tus archivos e información
                    </p>
                </div>
                <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    Nuevo Flujo
                </button>
            </div>

            {/* How it Works Section */}
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-2xl p-6">
                <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                    <Code className="w-5 h-5 text-primary" />
                    ¿Cómo funciona?
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="space-y-2">
                        <h3 className="font-bold text-foreground flex items-center gap-2">
                            <Zap className="w-4 h-4 text-primary" />
                            1. Crea un Flujo
                        </h3>
                        <p className="text-muted-foreground">
                            Define un nombre y descripción para tu API. Cada flujo representa un endpoint personalizado.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <h3 className="font-bold text-foreground flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            2. Añade Bloques
                        </h3>
                        <p className="text-muted-foreground">
                            Arrastra bloques para leer archivos, transformar datos, aplicar condiciones o responder con información.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <h3 className="font-bold text-foreground flex items-center gap-2">
                            <Globe className="w-4 h-4 text-primary" />
                            3. Despliega
                        </h3>
                        <p className="text-muted-foreground">
                            Configura el endpoint, método HTTP y políticas de seguridad. Luego despliega y obtén tu URL de API.
                        </p>
                    </div>
                </div>
            </div>

            {/* Create Flow Modal */}
            {mounted && isCreating && createPortal(
            <AnimatePresence>
                {isCreating && (
                        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/60 backdrop-blur-sm" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999 }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-background border border-border/60 rounded-2xl p-6 shadow-2xl w-full max-w-md"
                                style={{ position: 'relative', zIndex: 100000 }}
                        >
                            <h3 className="text-lg font-bold text-foreground mb-4">Nuevo Flujo de API</h3>
                            <input
                                type="text"
                                value={newFlowName}
                                onChange={(e) => setNewFlowName(e.target.value)}
                                placeholder="Nombre del flujo..."
                                className="w-full bg-muted/50 border border-border/60 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreateFlow();
                                    if (e.key === 'Escape') setIsCreating(false);
                                }}
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={handleCreateFlow}
                                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors"
                                >
                                    Crear
                                </button>
                                <button
                                    onClick={() => setIsCreating(false)}
                                    className="px-4 py-2 bg-muted text-foreground rounded-xl font-bold hover:bg-muted/80 transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
                </AnimatePresence>,
                document.body
            )}

            <div className="space-y-6">
                {/* Flows List - Horizontal */}
                <div className="space-y-4">
                    <h2 className="text-lg font-bold text-foreground">Tus Flujos</h2>
                    <div className="space-y-2">
                        {flows.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground border border-border/60 rounded-2xl">
                                <Code className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p className="text-sm">No hay flujos creados</p>
                            </div>
                        ) : (
                            flows.map((flow) => (
                                <div
                                    key={flow.id}
                                    className={cn(
                                        "p-4 rounded-xl border transition-all cursor-pointer",
                                        selectedFlow?.id === flow.id
                                            ? "bg-primary/10 border-primary shadow-sm"
                                            : "bg-background border-border/60 hover:bg-muted/30"
                                    )}
                                    onClick={() => {
                                        // Normalize flow data before selecting
                                        let blocks = flow.blocks;
                                        if (typeof blocks === 'string') {
                                            try {
                                                blocks = JSON.parse(blocks);
                                            } catch {
                                                blocks = [];
                                            }
                                        }
                                        if (!Array.isArray(blocks)) blocks = [];
                                        // Restore icon components for blocks and ensure blockType is set
                                        blocks = blocks.map((block: any) => {
                                            // Try to find block type by blockType field, or by id (for backwards compatibility)
                                            const blockTypeId = block.blockType || block.id;
                                            const blockType = blockTypes.find(bt => bt.id === blockTypeId);
                                            return {
                                                ...block,
                                                blockType: blockTypeId, // Ensure blockType is set
                                                icon: blockType?.icon || block.icon,
                                                name: blockType?.name || block.name,
                                                color: blockType?.color || block.color,
                                            };
                                        });

                                        let policies = flow.policies;
                                        if (typeof policies === 'string') {
                                            try {
                                                policies = JSON.parse(policies);
                                            } catch {
                                                policies = {
                                                    requireAuth: false,
                                                    rateLimit: 60,
                                                    allowedOrigins: [],
                                                    requirePassword: false,
                                                    maxFileSize: 100 * 1024 * 1024,
                                                    allowedMimeTypes: [],
                                                } as ApiPolicy;
                                            }
                                        }
                                        if (!policies || typeof policies !== 'object') {
                                            policies = {
                                                requireAuth: false,
                                                rateLimit: 60,
                                                allowedOrigins: [],
                                                requirePassword: false,
                                                maxFileSize: 100 * 1024 * 1024,
                                                allowedMimeTypes: [],
                                            } as ApiPolicy;
                                        }
                                        if (!Array.isArray(policies.allowedOrigins)) {
                                            policies.allowedOrigins = [];
                                        }

                                        let selectedFiles = flow.selectedFiles;
                                        if (typeof selectedFiles === 'string') {
                                            try {
                                                selectedFiles = JSON.parse(selectedFiles);
                                            } catch {
                                                selectedFiles = [];
                                            }
                                        }
                                        if (!Array.isArray(selectedFiles)) selectedFiles = [];

                                        setSelectedFlow({
                                            ...flow,
                                            blocks,
                                            policies,
                                            selectedFiles,
                                            apiUrl: flow.apiUrl ? String(flow.apiUrl) : undefined,
                                            apiKey: flow.apiKey ? String(flow.apiKey) : undefined,
                                            endpoint: flow.endpoint ? String(flow.endpoint) : '',
                                            method: flow.method || 'GET',
                                        });
                                    }}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                            <h3 className="font-bold text-foreground">{flow.name}</h3>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {Array.isArray(flow.blocks) ? flow.blocks.length : 0} bloques
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteFlow(flow.id);
                                            }}
                                            className="p-1 hover:bg-red-500/10 rounded-lg text-red-500"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {flow.deployed && (
                                        <div className="flex items-center gap-1 text-xs text-green-500 font-bold">
                                            <Globe className="w-3 h-3" />
                                            Desplegado
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Flow Builder */}
                <div className="w-full space-y-4">
                    {selectedFlow ? (
                        <>
                            {/* Flow Header & URL */}
                            <div className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex-1">
                                        <h2 className="text-xl font-bold text-foreground">{selectedFlow.name}</h2>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {Array.isArray(selectedFlow.blocks) ? selectedFlow.blocks.length : 0} bloques configurados
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={selectedFlow.endpoint || ''}
                                            onChange={async (e) => {
                                                const newEndpoint = e.target.value;
                                                const updated = { ...selectedFlow, endpoint: newEndpoint };
                                                setSelectedFlow(updated);
                                                setFlows(flows.map(f => f.id === selectedFlow.id ? updated : f));
                                                
                                                // Save to backend
                                                try {
                                                    await axios.put(`${API_BASE}/api/api-flows/${selectedFlow.id}`, {
                                                        endpoint: newEndpoint,
                                                    }, { withCredentials: true });
                                                } catch (err) {
                                                    console.error('Failed to update endpoint:', err);
                                                }
                                            }}
                                            placeholder="/mi-api"
                                            className="px-3 py-1.5 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                        <select
                                            value={selectedFlow.method || 'GET'}
                                            onChange={async (e) => {
                                                const newMethod = e.target.value as any;
                                                const updated = { ...selectedFlow, method: newMethod };
                                                setSelectedFlow(updated);
                                                setFlows(flows.map(f => f.id === selectedFlow.id ? updated : f));
                                                
                                                // Save to backend
                                                try {
                                                    await axios.put(`${API_BASE}/api/api-flows/${selectedFlow.id}`, {
                                                        method: newMethod,
                                                    }, { withCredentials: true });
                                                } catch (err) {
                                                    console.error('Failed to update method:', err);
                                                }
                                            }}
                                            className="px-3 py-1.5 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        >
                                            <option value="GET">GET</option>
                                            <option value="POST">POST</option>
                                            <option value="PUT">PUT</option>
                                            <option value="DELETE">DELETE</option>
                                        </select>
                                        {selectedFlow.deployed ? (
                                            <button
                                                onClick={() => handleUndeploy(selectedFlow)}
                                                disabled={loading}
                                                className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg font-bold hover:bg-orange-600 transition-colors disabled:opacity-50"
                                            >
                                                <Pause className="w-4 h-4" />
                                                Pausar
                                            </button>
                                        ) : (
                                        <button
                                            onClick={() => handleDeploy(selectedFlow)}
                                            disabled={loading || !selectedFlow.endpoint}
                                            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                                        >
                                            <Play className="w-4 h-4" />
                                            Desplegar
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setShowDocs(!showDocs)}
                                            className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg font-bold hover:bg-muted/80 transition-colors"
                                        >
                                            <Book className="w-4 h-4" />
                                            Docs
                                        </button>
                                    </div>
                                </div>

                                {/* API URL Display */}
                                {selectedFlow.deployed && selectedFlow.apiUrl && (
                                    <div className="mt-4 p-4 bg-muted/30 rounded-xl border border-border/40">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">URL de la API</p>
                                                <div className="flex items-center gap-2">
                                                    <code className="text-sm font-mono text-foreground bg-background px-3 py-1.5 rounded-lg border border-border/40">
                                                        {String(selectedFlow.apiUrl || '')}
                                                    </code>
                                                    <button
                                                        onClick={() => handleCopyUrl(selectedFlow.apiUrl!)}
                                                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                                                    >
                                                        {copiedUrl === selectedFlow.apiUrl ? (
                                                            <Check className="w-4 h-4 text-green-500" />
                                                        ) : (
                                                            <Copy className="w-4 h-4 text-muted-foreground" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        {selectedFlow.apiKey && (
                                            <div className="mt-3">
                                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">API Key</p>
                                                <div className="flex items-center gap-2">
                                                    <code className="text-xs font-mono text-foreground bg-background px-3 py-1.5 rounded-lg border border-border/40">
                                                        {String(selectedFlow.apiKey || '')}
                                                    </code>
                                                    <button
                                                        onClick={() => handleCopyUrl(selectedFlow.apiKey!)}
                                                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                                                    >
                                                        {copiedUrl === selectedFlow.apiKey ? (
                                                            <Check className="w-4 h-4 text-green-500" />
                                                        ) : (
                                                            <Copy className="w-4 h-4 text-muted-foreground" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Policies & Files */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Policies */}
                                <div className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Shield className="w-5 h-5 text-primary" />
                                        <h3 className="text-lg font-bold text-foreground">Políticas</h3>
                                    </div>
                                    <div className="space-y-4">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedFlow.policies?.requireAuth || false}
                                                onChange={(e) => handleUpdatePolicies({ requireAuth: e.target.checked })}
                                                className="w-4 h-4 rounded border-border"
                                            />
                                            <div>
                                                <span className="text-sm font-bold text-foreground">Requerir Autenticación</span>
                                                <p className="text-xs text-muted-foreground">Solo usuarios autenticados</p>
                                            </div>
                                        </label>
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedFlow.policies?.requirePassword || false}
                                                onChange={(e) => handleUpdatePolicies({ requirePassword: e.target.checked })}
                                                className="w-4 h-4 rounded border-border"
                                            />
                                            <div>
                                                <span className="text-sm font-bold text-foreground">Contraseña</span>
                                                <p className="text-xs text-muted-foreground">Proteger con contraseña</p>
                                            </div>
                                        </label>
                                        {selectedFlow.policies?.requirePassword && (
                                            <input
                                                type="password"
                                                value={selectedFlow.policies?.password || ''}
                                                onChange={(e) => handleUpdatePolicies({ password: e.target.value })}
                                                placeholder="Contraseña..."
                                                className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        )}
                                        <div>
                                            <label className="text-sm font-bold text-foreground block mb-2">
                                                Rate Limit (req/min)
                                            </label>
                                            <input
                                                type="number"
                                                value={selectedFlow.policies?.rateLimit || 60}
                                                onChange={(e) => handleUpdatePolicies({ rateLimit: parseInt(e.target.value) || 60 })}
                                                className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-bold text-foreground block mb-2">
                                                Orígenes Permitidos (CORS)
                                            </label>
                                            <input
                                                type="text"
                                                value={Array.isArray(selectedFlow.policies?.allowedOrigins) ? selectedFlow.policies.allowedOrigins.join(', ') : ''}
                                                onChange={(e) => handleUpdatePolicies({ 
                                                    allowedOrigins: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                                })}
                                                placeholder="https://example.com, https://app.example.com"
                                                className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Selected Files */}
                                <div className="bg-background border border-border/60 rounded-2xl p-6 shadow-sm">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <File className="w-5 h-5 text-primary" />
                                            <h3 className="text-lg font-bold text-foreground">Archivos</h3>
                                        </div>
                                        <button
                                            onClick={() => setIsSelectingFiles(true)}
                                            className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-bold hover:bg-primary/20 transition-colors"
                                        >
                                            <Plus className="w-3 h-3 inline mr-1" />
                                            Agregar
                                        </button>
                                    </div>
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {!selectedFlow.selectedFiles || selectedFlow.selectedFiles.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-4">
                                                No hay archivos seleccionados
                                            </p>
                                        ) : (
                                            (selectedFlow.selectedFiles || []).map(fileId => {
                                                const file = availableFiles.find(f => f.id === fileId);
                                                return file ? (
                                                    <div key={fileId} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                                                            <span className="text-sm font-medium text-foreground truncate">
                                                                {file.originalName}
                                                            </span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleToggleFile(fileId)}
                                                            className="p-1 hover:bg-red-500/10 rounded text-red-500"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ) : null;
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Scratch-like Interface: 3 Column Layout */}
                            <div className="grid grid-cols-12 gap-4 h-[calc(100vh-250px)] min-h-[700px] w-full">
                                {/* Left Column: Categories & Blocks */}
                                <div className="col-span-3 bg-background border border-border/60 rounded-2xl p-4 shadow-sm flex flex-col overflow-hidden">
                                    <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                                        <Layers className="w-4 h-4" />
                                        Bloques
                                    </h3>
                                    
                                    {/* Category Tabs */}
                                    <div className="flex flex-wrap gap-1 mb-3 overflow-x-auto pb-2">
                                        {blockCategories.map((category) => (
                                            <button
                                                key={category.id}
                                                onClick={() => setSelectedCategory(category.id)}
                                                className={cn(
                                                    "px-2 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap",
                                                    selectedCategory === category.id
                                                        ? "bg-primary text-primary-foreground"
                                                        : "bg-muted/30 text-foreground hover:bg-muted/50"
                                                )}
                                            >
                                                {category.name}
                                            </button>
                                        ))}
                                    </div>
                                    
                                    {/* Blocks in Selected Category */}
                                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                                        {blockCategories
                                            .find(c => c.id === selectedCategory)
                                            ?.blocks.map((block) => (
                                                <div
                                                    key={block.id}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        setDraggedBlock(block);
                                                        e.dataTransfer.effectAllowed = 'move';
                                                    }}
                                                    onDragEnd={() => setDraggedBlock(null)}
                                                    className={cn(
                                                        "flex items-center gap-2 p-2 rounded-lg border cursor-move transition-all",
                                                        "bg-muted/30 border-border/40 hover:bg-muted/50 hover:border-border/60",
                                                        "hover:shadow-sm active:scale-95"
                                                    )}
                                                >
                                                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0", block.color)}>
                                                        {(() => {
                                                            const IconComponent = typeof block.icon === 'function' ? block.icon : getBlockIcon(block.id);
                                                            return <IconComponent className="w-4 h-4" />;
                                                        })()}
                                                    </div>
                                                    <span className="text-xs font-bold text-foreground flex-1 text-left">
                                                        {block.name}
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                </div>

                                {/* Center Column: Canvas */}
                                <div className="col-span-6 bg-background border border-border/60 rounded-2xl p-6 shadow-sm flex flex-col overflow-hidden">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                                            <Code className="w-4 h-4" />
                                            Canvas
                                        </h3>
                                        {selectedFlow.blocks && selectedFlow.blocks.length > 0 && (
                                            <button
                                                onClick={handlePreview}
                                                disabled={previewLoading}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-bold hover:bg-primary/20 transition-colors disabled:opacity-50"
                                            >
                                                <Globe className="w-3.5 h-3.5" />
                                                {previewLoading ? 'Ejecutando...' : 'Preview'}
                                            </button>
                                        )}
                                    </div>
                                    
                                    {/* Drop Zone */}
                                    <div
                                        className="flex-1 overflow-y-auto space-y-2 p-2 rounded-lg border-2 border-dashed transition-colors"
                                        style={{
                                            backgroundColor: dragOverIndex !== null ? 'rgba(var(--primary), 0.05)' : 'transparent',
                                            borderColor: dragOverIndex !== null ? 'rgba(var(--primary), 0.3)' : 'rgba(var(--border), 0.3)',
                                        }}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = 'move';
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (draggedBlock) {
                                                handleAddBlock(draggedBlock);
                                                setDraggedBlock(null);
                                            }
                                        }}
                                    >
                                        {!selectedFlow.blocks || !Array.isArray(selectedFlow.blocks) || selectedFlow.blocks.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-full text-center py-12 text-muted-foreground">
                                                <Code className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                                <p className="text-sm font-bold mb-1">Arrastra bloques aquí</p>
                                                <p className="text-xs">Construye tu API arrastrando bloques desde la izquierda</p>
                                            </div>
                                        ) : (
                                            (selectedFlow.blocks || []).map((block, index) => (
                                                <div
                                                    key={block.id}
                                                    draggable
                                                    onDragStart={(e: React.DragEvent) => {
                                                        e.dataTransfer.effectAllowed = 'move';
                                                    }}
                                                    className={cn(
                                                        "flex items-center gap-3 p-3 rounded-xl border group relative",
                                                        "bg-muted/30 border-border/40 hover:bg-muted/50 hover:border-border/60",
                                                        "cursor-move transition-all"
                                                    )}
                                                >
                                                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0", block.color)}>
                                                        {(() => {
                                                            const IconComponent = typeof block.icon === 'function' ? block.icon : getBlockIcon(block.id);
                                                            return <IconComponent className="w-5 h-5" />;
                                                        })()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-foreground">{block.name}</p>
                                                        {block.config?.fileName && (
                                                            <p className="text-xs text-muted-foreground truncate">
                                                                {block.config.fileName}
                                                            </p>
                                                        )}
                                                        {!block.config?.fileName && (
                                                            <p className="text-xs text-muted-foreground">Bloque {index + 1}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => handleEditBlock(block.id)}
                                                            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                                                            title="Editar"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleRemoveBlock(block.id)}
                                                            className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                                        </button>
                                                    </div>
                                                    {index < (selectedFlow.blocks || []).length - 1 && (
                                                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 absolute -right-2 top-1/2 -translate-y-1/2 bg-background p-0.5 rounded-full" />
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Right Column: Preview Browser */}
                                <div className="col-span-3 bg-background border border-border/60 rounded-2xl shadow-sm flex flex-col overflow-hidden">
                                    <div className="p-4 border-b border-border/40">
                                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                                            <Globe className="w-4 h-4" />
                                            Preview
                                        </h3>
                                    </div>
                                    
                                    <div className="flex-1 overflow-hidden flex flex-col">
                                        {/* Browser Window */}
                                        <div className="flex-1 bg-muted/20 rounded-lg m-4 overflow-hidden flex flex-col border border-border/40">
                                            {/* Browser Chrome */}
                                            <div className="bg-muted/50 border-b border-border/40 px-3 py-2 flex items-center gap-2">
                                                <div className="flex gap-1.5">
                                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60"></div>
                                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60"></div>
                                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/60"></div>
                                                </div>
                                                <div className="flex-1 bg-background rounded px-2 py-1 text-[10px] text-muted-foreground font-mono truncate">
                                                    {selectedFlow.apiUrl || `${API_BASE}/api/custom${selectedFlow.endpoint || ''}`}
                                                </div>
                                            </div>
                                            
                                            {/* Browser Content */}
                                            <div className="flex-1 overflow-auto bg-background p-4">
                                                {previewLoading ? (
                                                    <div className="flex items-center justify-center h-full">
                                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                                    </div>
                                                ) : previewError ? (
                                                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                                        <p className="text-xs text-red-500 font-bold mb-1">Error</p>
                                                        <p className="text-[10px] text-red-500/80">{previewError}</p>
                                                    </div>
                                                ) : previewData !== null ? (
                                                    <div className="space-y-2">
                                                        {typeof previewData === 'object' ? (
                                                            <pre className="text-[10px] font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
                                                                {JSON.stringify(previewData, null, 2)}
                                                            </pre>
                                                        ) : (
                                                            <pre className="text-[10px] font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
                                                                {String(previewData)}
                                                            </pre>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                                                        <Globe className="w-12 h-12 mb-3 opacity-20" />
                                                        <p className="text-xs font-bold mb-1">Sin Preview</p>
                                                        <p className="text-[10px]">Haz clic en "Preview" para ver el resultado</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {/* Preview Info */}
                                        {previewData !== null && (
                                            <div className="px-4 pb-4">
                                                <div className="bg-muted/30 rounded-lg p-2">
                                                    <p className="text-[10px] text-muted-foreground">
                                                        <strong className="text-foreground">Tipo:</strong> {typeof previewData}
                                                        {typeof previewData === 'object' && (
                                                            <> ({Array.isArray(previewData) ? 'Array' : 'Object'})</>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-background border border-border/60 rounded-2xl p-12 text-center">
                            <Code className="w-16 h-16 mx-auto mb-4 text-muted-foreground/20" />
                            <h3 className="text-lg font-bold text-foreground mb-2">Selecciona un flujo</h3>
                            <p className="text-sm text-muted-foreground">
                                Crea un nuevo flujo o selecciona uno existente para comenzar
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Block Editor Modal */}
            {mounted && isEditingBlock && selectedFlow && createPortal(
            <AnimatePresence>
                {isEditingBlock && selectedFlow && (
                        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/60 backdrop-blur-sm" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999 }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-background border border-border/60 rounded-2xl p-6 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
                                style={{ position: 'relative', zIndex: 100000 }}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-foreground">Configurar Bloque</h3>
                                <button
                                    onClick={() => setIsEditingBlock(null)}
                                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            {(() => {
                                if (!selectedFlow.blocks || !Array.isArray(selectedFlow.blocks)) return null;
                                const block = selectedFlow.blocks.find(b => b && b.id === isEditingBlock);
                                if (!block) return null;
                                
                                // Use blockType if available, otherwise fall back to block.id for backwards compatibility
                                const blockTypeId = block.blockType || block.id;
                                
                                if (blockTypeId === 'file-read') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">
                                                    Seleccionar Archivo
                                                </label>
                                                <select
                                                    value={block.config?.fileId || ''}
                                                    onChange={(e) => {
                                                        const file = availableFiles.find(f => f.id === e.target.value);
                                                        handleUpdateBlock(block.id, {
                                                            fileId: e.target.value,
                                                            fileName: file?.originalName,
                                                        });
                                                    }}
                                                    className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                >
                                                    <option value="">Usar primer archivo seleccionado</option>
                                                    {availableFiles.map(file => (
                                                        <option key={file.id} value={file.id}>
                                                            {file.originalName}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Si no seleccionas un archivo, se usará el primero de la lista "Archivos"
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setIsEditingBlock(null);
                                                    setIsSelectingFiles(true);
                                                }}
                                                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg font-bold hover:bg-primary/90 transition-colors"
                                            >
                                                Buscar más archivos
                                            </button>
                                            <div className="bg-muted/30 rounded-lg p-3 mt-4">
                                                <p className="text-xs font-bold text-foreground mb-2">Información:</p>
                                                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                                                    <li>Los archivos JSON se parsean automáticamente</li>
                                                    <li>Los archivos de texto se devuelven como string</li>
                                                    <li>Otros archivos se codifican en base64</li>
                                                </ul>
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'file-send') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">
                                                    Seleccionar Archivo
                                                </label>
                                                <select
                                                    value={block.config?.fileId || ''}
                                                    onChange={(e) => {
                                                        const file = availableFiles.find(f => f.id === e.target.value);
                                                        handleUpdateBlock(block.id, {
                                                            fileId: e.target.value,
                                                            fileName: file?.originalName,
                                                        });
                                                    }}
                                                    className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                >
                                                    <option value="">Selecciona un archivo...</option>
                                                    {availableFiles.map(file => (
                                                        <option key={file.id} value={file.id}>
                                                            {file.originalName}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Este bloque envía el archivo como respuesta de la API
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setIsEditingBlock(null);
                                                    setIsSelectingFiles(true);
                                                }}
                                                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg font-bold hover:bg-primary/90 transition-colors"
                                            >
                                                Buscar más archivos
                                            </button>
                                            <div className="bg-muted/30 rounded-lg p-3 mt-4">
                                                <p className="text-xs font-bold text-foreground mb-2">Nota:</p>
                                                <p className="text-xs text-muted-foreground">
                                                    El archivo se enviará con su tipo MIME original y nombre de archivo. Asegúrate de tener un bloque "Responder" configurado con formato "Archivo" después de este bloque.
                                                </p>
                                            </div>
                                        </div>
                                    );
                                }
                                
                                if (blockTypeId === 'custom-code') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">
                                                    Código JavaScript
                                                </label>
                                                <textarea
                                                    value={block.config?.code || ''}
                                                    onChange={(e) => handleUpdateBlock(block.id, { 
                                                        code: e.target.value 
                                                    })}
                                                    placeholder="// Escribe tu código aquí&#10;// Puedes usar: result, fileData, context&#10;// Ejemplo: result = { ...result, processed: true };"
                                                    className="w-full h-64 px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                />
                                                <p className="text-xs text-muted-foreground mt-2">
                                                    Variables disponibles: <code className="bg-muted px-1 rounded">result</code>, <code className="bg-muted px-1 rounded">fileData</code>, <code className="bg-muted px-1 rounded">context</code>, <code className="bg-muted px-1 rounded">console</code>
                                                </p>
                                            </div>
                                            <div className="bg-muted/30 rounded-lg p-3">
                                                <p className="text-xs font-bold text-foreground mb-2">Ejemplos:</p>
                                                <div className="text-xs text-muted-foreground space-y-2">
                                                    <div>
                                                        <p className="font-semibold">Modificar resultado:</p>
                                                        <pre className="bg-background p-2 rounded text-[10px] overflow-x-auto mt-1">
{`result = {
  ...result,
  processed: true,
  timestamp: new Date().toISOString()
};`}
                                                        </pre>
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold">Filtrar datos:</p>
                                                        <pre className="bg-background p-2 rounded text-[10px] overflow-x-auto mt-1">
{`if (Array.isArray(result)) {
  result = result.filter(item => item.active);
}`}
                                                        </pre>
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold">Usar contexto:</p>
                                                        <pre className="bg-background p-2 rounded text-[10px] overflow-x-auto mt-1">
{`const queryParam = context.query?.filter;
if (queryParam) {
  result = result.filter(item => 
    item.name.includes(queryParam)
  );
}`}
                                                        </pre>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'http-request') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">
                                                    URL
                                                </label>
                                                <input
                                                    type="text"
                                                    value={block.config?.url || ''}
                                                    onChange={(e) => handleUpdateBlock(block.id, { url: e.target.value })}
                                                    placeholder="https://api.example.com/data"
                                                    className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                />
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    URL completa del endpoint externo a consultar
                                                </p>
                                            </div>
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">
                                                    Método HTTP
                                                </label>
                                                <select
                                                    value={block.config?.method || 'GET'}
                                                    onChange={(e) => handleUpdateBlock(block.id, { method: e.target.value })}
                                                    className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                >
                                                    <option value="GET">GET</option>
                                                    <option value="POST">POST</option>
                                                    <option value="PUT">PUT</option>
                                                    <option value="DELETE">DELETE</option>
                                                    <option value="PATCH">PATCH</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">
                                                    Headers (JSON)
                                                </label>
                                                <textarea
                                                    value={block.config?.headers ? (typeof block.config.headers === 'string' ? block.config.headers : JSON.stringify(block.config.headers, null, 2)) : '{}'}
                                                    onChange={(e) => {
                                                        try {
                                                            const parsed = JSON.parse(e.target.value);
                                                            handleUpdateBlock(block.id, { headers: parsed });
                                                        } catch {
                                                            handleUpdateBlock(block.id, { headers: e.target.value });
                                                        }
                                                    }}
                                                    placeholder='{"Content-Type": "application/json", "Authorization": "Bearer token"}'
                                                    className="w-full h-24 px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                />
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Headers HTTP en formato JSON. Ejemplo: {"{"}"Authorization": "Bearer token"{"}"}
                                                </p>
                                            </div>
                                            {(block.config?.method === 'POST' || block.config?.method === 'PUT' || block.config?.method === 'PATCH') && (
                                                <div>
                                                    <label className="text-sm font-bold text-foreground block mb-2">
                                                        Body
                                                    </label>
                                                    <textarea
                                                        value={block.config?.body || ''}
                                                        onChange={(e) => handleUpdateBlock(block.id, { body: e.target.value })}
                                                        placeholder='{"key": "value"}'
                                                        className="w-full h-32 px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                    />
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        Cuerpo de la petición (JSON, texto, etc.)
                                                    </p>
                                                </div>
                                            )}
                                            <div className="bg-muted/30 rounded-lg p-3">
                                                <p className="text-xs font-bold text-foreground mb-2">Resultado:</p>
                                                <p className="text-xs text-muted-foreground">
                                                    El bloque devuelve un objeto con: <code className="bg-background px-1 rounded">status</code>, <code className="bg-background px-1 rounded">data</code>, <code className="bg-background px-1 rounded">headers</code>
                                                </p>
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'delay') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">
                                                    Tiempo de espera (milisegundos)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={block.config?.delay || 1000}
                                                    onChange={(e) => handleUpdateBlock(block.id, { delay: parseInt(e.target.value) || 0 })}
                                                    min="0"
                                                    max="60000"
                                                    step="100"
                                                    className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                />
                                                <p className="text-xs text-muted-foreground mt-2">
                                                    Máximo: 60000ms (60 segundos)
                                                </p>
                                            </div>
                                            <div className="bg-muted/30 rounded-lg p-3">
                                                <p className="text-xs font-bold text-foreground mb-2">Casos de uso:</p>
                                                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                                                    <li>Rate limiting: esperar entre peticiones</li>
                                                    <li>Simular procesamiento: añadir delay artificial</li>
                                                    <li>Esperar a que se complete una operación externa</li>
                                                </ul>
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'file-list') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <p className="text-sm text-muted-foreground mb-4">
                                                    Este bloque lista todos los archivos seleccionados en la sección "Archivos" del flujo.
                                                </p>
                                                <div className="bg-muted/30 rounded-lg p-3">
                                                    <p className="text-xs font-bold text-foreground mb-2">Información:</p>
                                                    <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside mb-3">
                                                        <li>Usa los archivos de la lista "Archivos"</li>
                                                        <li>Devuelve metadatos: id, nombre, tipo, tamaño, fecha</li>
                                                        <li>Útil para crear endpoints de listado</li>
                                                    </ul>
                                                    <p className="text-xs font-bold text-foreground mb-1">Estructura de respuesta:</p>
                                                    <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
{`[
  {
    "id": "...",
    "originalName": "archivo.pdf",
    "mimeType": "application/pdf",
    "size": "12345",
    "createdAt": "2024-01-01T00:00:00Z"
  }
]`}
                                                    </pre>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'data-transform') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">
                                                    Tipo de Transformación
                                                </label>
                                                <select
                                                    value={block.config?.transformType || ''}
                                                    onChange={(e) => handleUpdateBlock(block.id, { 
                                                        transformType: e.target.value 
                                                    })}
                                                    className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                >
                                                    <option value="">Selecciona una transformación...</option>
                                                    <option value="to-uppercase">A Mayúsculas</option>
                                                    <option value="to-lowercase">A Minúsculas</option>
                                                    <option value="parse-json">Parsear JSON (String → Objeto)</option>
                                                    <option value="stringify-json">Stringify JSON (Objeto → String)</option>
                                                </select>
                                                <p className="text-xs text-muted-foreground mt-2">
                                                    Transforma los datos del bloque anterior según el tipo seleccionado.
                                                </p>
                                            </div>
                                            <div className="bg-muted/30 rounded-lg p-3">
                                                <p className="text-xs font-bold text-foreground mb-2">Ejemplos:</p>
                                                <ul className="text-xs text-muted-foreground space-y-1">
                                                    <li><strong>A Mayúsculas:</strong> &quot;hola&quot; → &quot;HOLA&quot;</li>
                                                    <li><strong>A Minúsculas:</strong> &quot;HOLA&quot; → &quot;hola&quot;</li>
                                                    <li><strong>Parsear JSON:</strong> String JSON → Objeto JavaScript</li>
                                                    <li><strong>Stringify JSON:</strong> Objeto JavaScript → String JSON</li>
                                                </ul>
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'condition') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">
                                                    Campo a Evaluar
                                                </label>
                                                <input
                                                    type="text"
                                                    value={block.config?.conditionField || ''}
                                                    onChange={(e) => handleUpdateBlock(block.id, { 
                                                        conditionField: e.target.value 
                                                    })}
                                                    placeholder="nombre, status, id, etc."
                                                    className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                />
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Nombre del campo del objeto result a evaluar (ej: "status", "type", "id")
                                                </p>
                                            </div>
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">
                                                    Valor Esperado
                                                </label>
                                                <input
                                                    type="text"
                                                    value={block.config?.conditionValue || ''}
                                                    onChange={(e) => handleUpdateBlock(block.id, { 
                                                        conditionValue: e.target.value 
                                                    })}
                                                    placeholder="valor exacto a comparar"
                                                    className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                />
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Si el campo no coincide con este valor, se detiene la ejecución y se devuelve {"{"}conditionMet: false{"}"}
                                                </p>
                                            </div>
                                            <div className="bg-muted/30 rounded-lg p-3">
                                                <p className="text-xs font-bold text-foreground mb-2">Ejemplo práctico:</p>
                                                <div className="text-xs text-muted-foreground space-y-1">
                                                    <p>Si <code className="bg-background px-1 rounded">result</code> es:</p>
                                                    <pre className="bg-background p-2 rounded text-[10px] overflow-x-auto">
{`{
  "status": "active",
  "name": "test"
}`}
                                                    </pre>
                                                    <p className="mt-2">Campo: <code className="bg-background px-1 rounded">status</code></p>
                                                    <p>Valor: <code className="bg-background px-1 rounded">active</code></p>
                                                    <p className="text-green-500 mt-2">✓ Continúa (result.status === "active")</p>
                                                    <p className="text-red-500">✗ Se detiene si result.status !== "active"</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'response') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">
                                                    Formato de Respuesta
                                                </label>
                                                <select
                                                    value={block.config?.responseFormat || 'json'}
                                                    onChange={(e) => handleUpdateBlock(block.id, { 
                                                        responseFormat: e.target.value as any 
                                                    })}
                                                    className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                >
                                                    <option value="json">JSON</option>
                                                    <option value="file">Archivo</option>
                                                    <option value="text">Texto</option>
                                                </select>
                                                <p className="text-xs text-muted-foreground mt-2">
                                                    Define cómo se devolverá el resultado final de la API
                                                </p>
                                            </div>
                                            <div className="bg-muted/30 rounded-lg p-3">
                                                <p className="text-xs font-bold text-foreground mb-2">Formatos:</p>
                                                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                                                    <li><strong>JSON:</strong> Devuelve el resultado como JSON (Content-Type: application/json)</li>
                                                    <li><strong>Archivo:</strong> Para usar con bloque "Enviar Archivo", devuelve el archivo como descarga</li>
                                                    <li><strong>Texto:</strong> Devuelve el resultado como texto plano (Content-Type: text/plain)</li>
                                                </ul>
                                            </div>
                                        </div>
                                    );
                                }
                                
                                // Additional block configurations
                                // File Operations
                                if (blockTypeId === 'file-write') {
                                return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Nombre del Archivo</label>
                                                <input type="text" value={block.config?.fileName || ''} onChange={(e) => handleUpdateBlock(block.id, { fileName: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Contenido</label>
                                                <textarea value={block.config?.fileContent || ''} onChange={(e) => handleUpdateBlock(block.id, { fileContent: e.target.value })} className="w-full h-32 px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm font-mono" />
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'file-delete') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">ID del Archivo</label>
                                                <input type="text" value={block.config?.fileId || ''} onChange={(e) => handleUpdateBlock(block.id, { fileId: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                        </div>
                                    );
                                }

                                // Database Operations
                                if (blockTypeId === 'db-query' || blockTypeId === 'db-insert' || blockTypeId === 'db-update' || blockTypeId === 'db-delete') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Modelo</label>
                                                <select value={block.config?.dbModel || 'file'} onChange={(e) => handleUpdateBlock(block.id, { dbModel: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm">
                                                    <option value="file">File</option>
                                                    <option value="folder">Folder</option>
                                                    <option value="user">User</option>
                                                    <option value="link">Link</option>
                                                    <option value="document">Document</option>
                                                    <option value="note">Note</option>
                                                </select>
                                            </div>
                                            {(blockTypeId === 'db-query' || blockTypeId === 'db-update' || blockTypeId === 'db-delete') && (
                                                <div>
                                                    <label className="text-sm font-bold text-foreground block mb-2">Where (JSON)</label>
                                                    <textarea value={block.config?.dbWhere ? (typeof block.config.dbWhere === 'string' ? block.config.dbWhere : JSON.stringify(block.config.dbWhere, null, 2)) : '{}'} onChange={(e) => { try { handleUpdateBlock(block.id, { dbWhere: JSON.parse(e.target.value) }); } catch {} }} className="w-full h-24 px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm font-mono" />
                                                </div>
                                            )}
                                            {(blockTypeId === 'db-insert' || blockTypeId === 'db-update') && (
                                                <div>
                                                    <label className="text-sm font-bold text-foreground block mb-2">Data (JSON)</label>
                                                    <textarea value={block.config?.dbData ? (typeof block.config.dbData === 'string' ? block.config.dbData : JSON.stringify(block.config.dbData, null, 2)) : '{}'} onChange={(e) => { try { handleUpdateBlock(block.id, { dbData: JSON.parse(e.target.value) }); } catch {} }} className="w-full h-32 px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm font-mono" />
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                // Array/Object Operations
                                if (blockTypeId === 'array-map' || blockTypeId === 'array-filter' || blockTypeId === 'array-reduce') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Función JavaScript</label>
                                                <textarea value={block.config?.mapFunction || block.config?.filterFunction || block.config?.reduceFunction || ''} onChange={(e) => handleUpdateBlock(block.id, { [blockTypeId === 'array-map' ? 'mapFunction' : blockTypeId === 'array-filter' ? 'filterFunction' : 'reduceFunction']: e.target.value })} placeholder="item => item.value > 10" className="w-full h-24 px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm font-mono" />
                                            </div>
                                            {blockTypeId === 'array-reduce' && (
                                                <div>
                                                    <label className="text-sm font-bold text-foreground block mb-2">Valor Inicial (opcional)</label>
                                                    <input type="text" value={block.config?.reduceInitial || ''} onChange={(e) => { try { handleUpdateBlock(block.id, { reduceInitial: JSON.parse(e.target.value) }); } catch { handleUpdateBlock(block.id, { reduceInitial: e.target.value }); } }} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'array-sort') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Campo (opcional)</label>
                                                <input type="text" value={block.config?.sortField || ''} onChange={(e) => handleUpdateBlock(block.id, { sortField: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Orden</label>
                                                <select value={block.config?.sortOrder || 'asc'} onChange={(e) => handleUpdateBlock(block.id, { sortOrder: e.target.value as any })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm">
                                                    <option value="asc">Ascendente</option>
                                                    <option value="desc">Descendente</option>
                                                </select>
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'array-group') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Campo para Agrupar</label>
                                                <input type="text" value={block.config?.groupField || ''} onChange={(e) => handleUpdateBlock(block.id, { groupField: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'object-pick') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Campos (separados por comas)</label>
                                                <input type="text" value={Array.isArray(block.config?.pickFields) ? block.config.pickFields.join(', ') : ''} onChange={(e) => handleUpdateBlock(block.id, { pickFields: e.target.value.split(',').map(s => s.trim()).filter(s => s) })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                        </div>
                                    );
                                }

                                // String Operations
                                if (blockTypeId === 'string-replace') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Patrón (Regex)</label>
                                                <input type="text" value={block.config?.replacePattern || ''} onChange={(e) => handleUpdateBlock(block.id, { replacePattern: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Reemplazar con</label>
                                                <input type="text" value={block.config?.replaceValue || ''} onChange={(e) => handleUpdateBlock(block.id, { replaceValue: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'string-split' || blockTypeId === 'string-join') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Delimitador</label>
                                                <input type="text" value={block.config?.splitDelimiter || block.config?.joinDelimiter || ','} onChange={(e) => handleUpdateBlock(block.id, { [blockTypeId === 'string-split' ? 'splitDelimiter' : 'joinDelimiter']: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'string-regex') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Patrón Regex</label>
                                                <input type="text" value={block.config?.regexPattern || ''} onChange={(e) => handleUpdateBlock(block.id, { regexPattern: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Flags (g, i, m)</label>
                                                <input type="text" value={block.config?.regexFlags || 'g'} onChange={(e) => handleUpdateBlock(block.id, { regexFlags: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'string-encode' || blockTypeId === 'string-decode') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Tipo</label>
                                                <select value={block.config?.encodeType || 'base64'} onChange={(e) => handleUpdateBlock(block.id, { encodeType: e.target.value as any })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm">
                                                    <option value="base64">Base64</option>
                                                    <option value="url">URL Encode</option>
                                                    <option value="uri">URI Encode</option>
                                                </select>
                                            </div>
                                        </div>
                                    );
                                }

                                // Math Operations
                                if (blockTypeId === 'math-calculate') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Expresión (usa 'result' para el valor actual)</label>
                                                <input type="text" value={block.config?.mathExpression || ''} onChange={(e) => handleUpdateBlock(block.id, { mathExpression: e.target.value })} placeholder="result * 2 + 10" className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm font-mono" />
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'math-round') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Decimales</label>
                                                <input type="number" value={block.config?.roundDecimals || 0} onChange={(e) => handleUpdateBlock(block.id, { roundDecimals: parseInt(e.target.value) || 0 })} min="0" max="10" className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'math-random') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Mínimo</label>
                                                <input type="number" value={block.config?.randomMin || 0} onChange={(e) => handleUpdateBlock(block.id, { randomMin: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Máximo</label>
                                                <input type="number" value={block.config?.randomMax || 100} onChange={(e) => handleUpdateBlock(block.id, { randomMax: parseInt(e.target.value) || 100 })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                        </div>
                                    );
                                }

                                // Date Operations
                                if (blockTypeId === 'date-format') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Formato (YYYY-MM-DD HH:mm:ss o ISO/locale)</label>
                                                <input type="text" value={block.config?.dateFormat || 'ISO'} onChange={(e) => handleUpdateBlock(block.id, { dateFormat: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'date-add') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Valor</label>
                                                <input type="number" value={block.config?.dateAddValue || 0} onChange={(e) => handleUpdateBlock(block.id, { dateAddValue: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Unidad</label>
                                                <select value={block.config?.dateAddUnit || 'd'} onChange={(e) => handleUpdateBlock(block.id, { dateAddUnit: e.target.value as any })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm">
                                                    <option value="ms">Milisegundos</option>
                                                    <option value="s">Segundos</option>
                                                    <option value="m">Minutos</option>
                                                    <option value="h">Horas</option>
                                                    <option value="d">Días</option>
                                                    <option value="M">Meses</option>
                                                    <option value="y">Años</option>
                                                </select>
                                            </div>
                                        </div>
                                    );
                                }

                                // Variables
                                if (blockTypeId === 'set-variable' || blockTypeId === 'get-variable') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Nombre de Variable</label>
                                                <input type="text" value={block.config?.variableName || ''} onChange={(e) => handleUpdateBlock(block.id, { variableName: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                            {blockTypeId === 'set-variable' && (
                                                <div>
                                                    <label className="text-sm font-bold text-foreground block mb-2">Valor (opcional, usa resultado anterior si está vacío)</label>
                                                    <input type="text" value={block.config?.variableValue || ''} onChange={(e) => { try { handleUpdateBlock(block.id, { variableValue: JSON.parse(e.target.value) }); } catch { handleUpdateBlock(block.id, { variableValue: e.target.value }); } }} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                // Encoding/Hashing
                                if (blockTypeId === 'encode-base64' || blockTypeId === 'decode-base64') {
                                    return (
                                        <div className="space-y-4">
                                            <p className="text-xs text-muted-foreground">Codifica/Decodifica en Base64 automáticamente</p>
                                        </div>
                                    );
                                }

                                if (blockTypeId === 'hash-md5' || blockTypeId === 'hash-sha256') {
                                    return (
                                        <div className="space-y-4">
                                            <p className="text-xs text-muted-foreground">Genera hash {blockTypeId === 'hash-md5' ? 'MD5' : 'SHA256'} del resultado anterior</p>
                                        </div>
                                    );
                                }

                                // Cache
                                if (blockTypeId === 'cache-set' || blockTypeId === 'cache-get') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Clave de Cache</label>
                                                <input type="text" value={block.config?.cacheKey || ''} onChange={(e) => handleUpdateBlock(block.id, { cacheKey: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                            {blockTypeId === 'cache-set' && (
                                                <>
                                                    <div>
                                                        <label className="text-sm font-bold text-foreground block mb-2">TTL (milisegundos)</label>
                                                        <input type="number" value={block.config?.cacheTtl || 3600000} onChange={(e) => handleUpdateBlock(block.id, { cacheTtl: parseInt(e.target.value) || 3600000 })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                }

                                // Webhook
                                if (blockTypeId === 'webhook-send') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">URL del Webhook</label>
                                                <input type="url" value={block.config?.webhookUrl || ''} onChange={(e) => handleUpdateBlock(block.id, { webhookUrl: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                        </div>
                                    );
                                }

                                // Redirect
                                if (blockTypeId === 'redirect') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">URL de Redirección</label>
                                                <input type="url" value={block.config?.redirectUrl || ''} onChange={(e) => handleUpdateBlock(block.id, { redirectUrl: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Código HTTP</label>
                                                <select value={block.config?.redirectCode || 302} onChange={(e) => handleUpdateBlock(block.id, { redirectCode: parseInt(e.target.value) })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm">
                                                    <option value="301">301 - Permanent</option>
                                                    <option value="302">302 - Temporary</option>
                                                    <option value="307">307 - Temporary (Preserve Method)</option>
                                                </select>
                                            </div>
                                        </div>
                                    );
                                }

                                // Cookie
                                if (blockTypeId === 'set-cookie' || blockTypeId === 'get-cookie') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Nombre de Cookie</label>
                                                <input type="text" value={block.config?.cookieName || ''} onChange={(e) => handleUpdateBlock(block.id, { cookieName: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                            {blockTypeId === 'set-cookie' && (
                                                <div>
                                                    <label className="text-sm font-bold text-foreground block mb-2">Valor (opcional, usa resultado si está vacío)</label>
                                                    <input type="text" value={block.config?.cookieValue || ''} onChange={(e) => handleUpdateBlock(block.id, { cookieValue: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                // Compression
                                if (blockTypeId === 'compress' || blockTypeId === 'decompress') {
                                    return (
                                        <div className="space-y-4">
                                            <p className="text-xs text-muted-foreground">Comprime/Descomprime usando GZIP automáticamente</p>
                                        </div>
                                    );
                                }

                                // Throw Error
                                if (blockTypeId === 'throw-error') {
                                    return (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-foreground block mb-2">Mensaje de Error</label>
                                                <input type="text" value={block.config?.errorMessage || ''} onChange={(e) => handleUpdateBlock(block.id, { errorMessage: e.target.value })} className="w-full px-3 py-2 bg-muted/50 border border-border/60 rounded-lg text-sm" />
                                            </div>
                                        </div>
                                    );
                                }

                                // Default fallback for blocks without specific config
                                return (
                                    <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground">
                                            Este bloque no requiere configuración adicional o usa el resultado del bloque anterior.
                                        </p>
                                        <div className="bg-muted/30 rounded-lg p-3">
                                            <p className="text-xs text-muted-foreground">
                                                Para configuraciones avanzadas, considera usar el bloque "Código Personalizado".
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}
                        </motion.div>
                    </div>
                )}
                </AnimatePresence>,
                document.body
            )}

            {/* File Selector Modal */}
            {mounted && isSelectingFiles && createPortal(
                <AnimatePresence>
                    {isSelectingFiles && (
                        <>
                            {/* Backdrop - Full screen coverage */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm"
                                onClick={() => setIsSelectingFiles(false)}
                                style={{
                                    position: 'fixed',
                                    margin: 0,
                                    padding: 0,
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    width: '100vw',
                                    height: '100vh',
                                    zIndex: 9998,
                                }}
                            />
                            {/* Modal Container - Centered on screen */}
                            <div 
                                className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
                                style={{
                                    position: 'fixed',
                                    margin: 0,
                                    padding: '1rem',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    width: '100vw',
                                    height: '100vh',
                                    zIndex: 9999,
                                }}
                            >
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                                    className="bg-background border border-border/60 rounded-2xl p-6 shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col pointer-events-auto"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-bold text-foreground">Seleccionar Archivos</h3>
                                        <button
                                            onClick={() => setIsSelectingFiles(false)}
                                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto space-y-2">
                                        {availableFiles.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-8">
                                                No hay archivos disponibles
                                            </p>
                                        ) : (
                                            availableFiles.map(file => (
                                                <div
                                                    key={file.id}
                                                    className={cn(
                                                        "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                                                        selectedFlow?.selectedFiles.includes(file.id)
                                                            ? "bg-primary/10 border-primary"
                                                            : "bg-muted/30 border-border/40 hover:bg-muted/50"
                                                    )}
                                                    onClick={() => handleToggleFile(file.id)}
                                                >
                                                    <FileText className="w-5 h-5 text-blue-500 shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-foreground truncate">
                                                            {file.originalName}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {file.mimeType}
                                                        </p>
                                                    </div>
                                                    {selectedFlow?.selectedFiles.includes(file.id) && (
                                                        <Check className="w-5 h-5 text-primary shrink-0" />
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <div className="mt-4 flex justify-end">
                                        <button
                                            onClick={() => setIsSelectingFiles(false)}
                                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-bold hover:bg-primary/90 transition-colors"
                                        >
                                            Cerrar
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        </>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Documentation Modal */}
            {mounted && showDocs && createPortal(
                <AnimatePresence>
                    {showDocs && (
                        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/60 backdrop-blur-sm" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999 }}>
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-background border border-border/60 rounded-2xl p-6 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
                                style={{ position: 'relative', zIndex: 100000 }}
                            >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-foreground">Documentación de Bloques</h3>
                                <button
                                    onClick={() => setShowDocs(false)}
                                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-6">
                                {/* Leer Archivo */}
                                <div className="border-b border-border/40 pb-4">
                                    <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-blue-500" />
                                        Leer Archivo
                                    </h4>
                                    <p className="text-sm text-muted-foreground mb-2">
                                        Lee el contenido de un archivo desde el almacenamiento.
                                    </p>
                                    <div className="bg-muted/30 rounded-lg p-3 font-mono text-xs">
                                        <p className="text-foreground">Variables disponibles:</p>
                                        <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                                            <li><code className="bg-background px-1 rounded">result</code> - Contiene el contenido del archivo leído</li>
                                            <li><code className="bg-background px-1 rounded">fileData</code> - Alias de result</li>
                                        </ul>
                                    </div>
                                </div>

                                {/* Listar Archivos */}
                                <div className="border-b border-border/40 pb-4">
                                    <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                                        <Database className="w-5 h-5 text-green-500" />
                                        Listar Archivos
                                    </h4>
                                    <p className="text-sm text-muted-foreground mb-2">
                                        Devuelve una lista de los archivos seleccionados con sus metadatos.
                                    </p>
                                </div>

                                {/* Enviar Archivo */}
                                <div className="border-b border-border/40 pb-4">
                                    <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                                        <File className="w-5 h-5 text-purple-500" />
                                        Enviar Archivo
                                    </h4>
                                    <p className="text-sm text-muted-foreground mb-2">
                                        Envía un archivo como respuesta de la API.
                                    </p>
                                </div>

                                {/* Transformar Datos */}
                                <div className="border-b border-border/40 pb-4">
                                    <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                                        <Zap className="w-5 h-5 text-yellow-500" />
                                        Transformar Datos
                                    </h4>
                                    <p className="text-sm text-muted-foreground mb-2">
                                        Transforma los datos usando operaciones predefinidas.
                                    </p>
                                    <div className="bg-muted/30 rounded-lg p-3 font-mono text-xs mt-2">
                                        <p className="text-foreground">Operaciones disponibles:</p>
                                        <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                                            <li><code className="bg-background px-1 rounded">to-uppercase</code> - Convierte texto a mayúsculas</li>
                                            <li><code className="bg-background px-1 rounded">to-lowercase</code> - Convierte texto a minúsculas</li>
                                            <li><code className="bg-background px-1 rounded">parse-json</code> - Parsea JSON desde string</li>
                                            <li><code className="bg-background px-1 rounded">stringify-json</code> - Convierte objeto a JSON string</li>
                                        </ul>
                                    </div>
                                </div>

                                {/* Código Personalizado */}
                                <div className="border-b border-border/40 pb-4">
                                    <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                                        <Code className="w-5 h-5 text-indigo-500" />
                                        Código Personalizado
                                    </h4>
                                    <p className="text-sm text-muted-foreground mb-2">
                                        Ejecuta código JavaScript personalizado. Útil para transformaciones complejas.
                                    </p>
                                    <div className="bg-muted/30 rounded-lg p-3 font-mono text-xs mt-2">
                                        <p className="text-foreground mb-2">Variables disponibles:</p>
                                        <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-2">
                                            <li><code className="bg-background px-1 rounded">result</code> - Resultado del bloque anterior</li>
                                            <li><code className="bg-background px-1 rounded">fileData</code> - Datos del archivo leído</li>
                                            <li><code className="bg-background px-1 rounded">context</code> - Contexto de la petición (query, body, params)</li>
                                            <li><code className="bg-background px-1 rounded">console</code> - Console para logging</li>
                                        </ul>
                                        <p className="text-foreground mt-2 mb-1">Ejemplo:</p>
                                        <pre className="bg-background p-2 rounded text-xs overflow-x-auto">
{`result = {
  ...result,
  processed: true,
  timestamp: new Date().toISOString()
};`}
                                        </pre>
                                    </div>
                                </div>

                                {/* HTTP Request */}
                                <div className="border-b border-border/40 pb-4">
                                    <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                                        <Globe className="w-5 h-5 text-cyan-500" />
                                        HTTP Request
                                    </h4>
                                    <p className="text-sm text-muted-foreground mb-2">
                                        Realiza una petición HTTP a una URL externa.
                                    </p>
                                    <div className="bg-muted/30 rounded-lg p-3 font-mono text-xs mt-2">
                                        <p className="text-foreground">El resultado contiene:</p>
                                        <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                                            <li><code className="bg-background px-1 rounded">status</code> - Código de estado HTTP</li>
                                            <li><code className="bg-background px-1 rounded">data</code> - Datos de la respuesta</li>
                                            <li><code className="bg-background px-1 rounded">headers</code> - Headers de la respuesta</li>
                                        </ul>
                                    </div>
                                </div>

                                {/* Esperar */}
                                <div className="border-b border-border/40 pb-4">
                                    <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                                        <Clock className="w-5 h-5 text-gray-500" />
                                        Esperar
                                    </h4>
                                    <p className="text-sm text-muted-foreground mb-2">
                                        Espera un tiempo determinado antes de continuar (útil para rate limiting).
                                    </p>
                                </div>

                                {/* Condición */}
                                <div className="border-b border-border/40 pb-4">
                                    <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                                        <Settings className="w-5 h-5 text-orange-500" />
                                        Condición
                                    </h4>
                                    <p className="text-sm text-muted-foreground mb-2">
                                        Evalúa una condición y detiene la ejecución si no se cumple.
                                    </p>
                                </div>

                                {/* Responder */}
                                <div className="pb-4">
                                    <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                                        <Globe className="w-5 h-5 text-primary" />
                                        Responder
                                    </h4>
                                    <p className="text-sm text-muted-foreground mb-2">
                                        Define el formato de la respuesta final de la API.
                                    </p>
                                    <div className="bg-muted/30 rounded-lg p-3 font-mono text-xs mt-2">
                                        <p className="text-foreground">Formatos disponibles:</p>
                                        <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                                            <li><code className="bg-background px-1 rounded">json</code> - Respuesta JSON</li>
                                            <li><code className="bg-background px-1 rounded">file</code> - Archivo binario</li>
                                            <li><code className="bg-background px-1 rounded">text</code> - Texto plano</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Console Modal */}
            {mounted && consoleLogs.length > 0 && createPortal(
                <AnimatePresence>
                    {consoleLogs.length > 0 && (
                        <div className="fixed bottom-4 right-4 z-[99999] w-96 max-h-96 bg-background border border-border/60 rounded-2xl shadow-2xl flex flex-col" style={{ position: 'fixed', zIndex: 99999 }}>
                        <div className="flex items-center justify-between p-4 border-b border-border/40">
                            <div className="flex items-center gap-2">
                                <Terminal className="w-5 h-5 text-primary" />
                                <h3 className="font-bold text-foreground">Consola</h3>
                            </div>
                            <button
                                onClick={() => setConsoleLogs([])}
                                className="p-1 hover:bg-muted rounded-lg transition-colors text-xs text-muted-foreground"
                            >
                                Limpiar
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
                            {consoleLogs.map((log, idx) => (
                                <div key={idx} className={cn(
                                    "p-2 rounded",
                                    log.type === 'error' && "bg-red-500/10 text-red-500",
                                    log.type === 'warn' && "bg-yellow-500/10 text-yellow-500",
                                    log.type === 'log' && "bg-muted/30 text-foreground"
                                )}>
                                    <span className="text-muted-foreground text-[10px]">
                                        {log.timestamp.toLocaleTimeString()}
                                    </span>
                                    <span className="ml-2">{log.message}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
        </>
    );
}
