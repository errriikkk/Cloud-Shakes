import express from 'express';
import prisma from '../config/db';
import { verifyPassword } from '../utils/auth';
import { minioClient, BUCKET_NAME } from '../utils/storage';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limit store for custom APIs (in-memory, could be moved to Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Helper to check rate limit
const checkRateLimit = (apiKey: string, limit: number): boolean => {
    const now = Date.now();
    const key = `api_${apiKey}`;
    const stored = rateLimitStore.get(key);

    if (!stored || now > stored.resetTime) {
        rateLimitStore.set(key, { count: 1, resetTime: now + 60000 }); // 1 minute window
        return true;
    }

    if (stored.count >= limit) {
        return false;
    }

    stored.count++;
    return true;
};

// Helper to validate storedName against path traversal
const isPathTraversal = (storedName: string): boolean => {
    return storedName.includes('..') || storedName.includes('/') || storedName.includes('\\');
};

// Helper to execute API blocks
export const executeBlocks = async (blocks: any[], context: any): Promise<any> => {
    let result: any = null;
    let fileData: any = null;
    let shouldStop = false;

    console.log(`[CUSTOM API] Executing ${blocks.length} blocks`);

    for (const block of blocks) {
        if (shouldStop) break;

        // Use blockType if available, otherwise use id
        const blockTypeId = block.blockType || block.id;
        console.log(`[CUSTOM API] Executing block: ${blockTypeId}`, block.config);

        switch (blockTypeId) {
            case 'file-read':
                // Try to get fileId from block config, or use first selected file
                let fileId = block.config?.fileId;
                if (!fileId && context.selectedFiles && context.selectedFiles.length > 0) {
                    fileId = context.selectedFiles[0];
                    console.log(`[CUSTOM API] file-read: Using first selected file: ${fileId}`);
                }
                
                if (fileId) {
                    const file = await prisma.file.findUnique({
                        where: { id: fileId },
                    });
                    if (file) {
                        // Validate against path traversal
                        if (isPathTraversal(file.storedName)) {
                            console.error(`[CUSTOM API] Path traversal attempt detected: ${file.storedName}`);
                            throw new Error('Invalid file path');
                        }
                        
                        // Get file from MinIO
                        try {
                            const stream = await minioClient.getObject(BUCKET_NAME, file.storedName);
                            const chunks: Buffer[] = [];
                            for await (const chunk of stream) {
                                chunks.push(chunk);
                            }
                            const buffer = Buffer.concat(chunks);
                            
                            if (file.mimeType?.startsWith('application/json')) {
                                fileData = JSON.parse(buffer.toString());
                                result = fileData;
                                console.log(`[CUSTOM API] File read as JSON, size: ${JSON.stringify(result).length} chars`);
                            } else if (file.mimeType?.startsWith('text/')) {
                                fileData = buffer.toString();
                                result = fileData;
                                console.log(`[CUSTOM API] File read as text, size: ${fileData.length} chars`);
                            } else {
                                fileData = buffer.toString('base64');
                                result = fileData;
                                console.log(`[CUSTOM API] File read as base64, size: ${fileData.length} chars`);
                            }
                        } catch (err: any) {
                            console.error(`[CUSTOM API] Error reading file:`, err);
                            throw new Error(`Failed to read file: ${err.message}`);
                        }
                    } else {
                        console.error(`[CUSTOM API] File not found: ${fileId}`);
                        throw new Error(`File not found: ${fileId}`);
                    }
                } else {
                    console.warn(`[CUSTOM API] file-read block has no fileId configured and no selected files`);
                    throw new Error('No file specified for file-read block');
                }
                break;

            case 'file-list':
                const files = await prisma.file.findMany({
                    where: {
                        id: { in: context.selectedFiles || [] }
                    },
                    select: {
                        id: true,
                        originalName: true,
                        mimeType: true,
                        size: true,
                        createdAt: true,
                    },
                });
                result = files.map((f: any) => ({
                    ...f,
                    size: f.size.toString(),
                }));
                break;

            case 'file-send':
                // This block sends a file as the response
                if (block.config?.fileId) {
                    const file = await prisma.file.findUnique({
                        where: { id: block.config.fileId },
                    });
                    if (file) {
                        // Return file info for streaming
                        result = {
                            type: 'file',
                            fileId: file.id,
                            fileName: file.originalName,
                            mimeType: file.mimeType,
                            storedName: file.storedName,
                        };
                    }
                }
                break;

            case 'data-transform':
                const dataToTransform = result || fileData;
                if (dataToTransform && block.config?.transformType) {
                    switch (block.config.transformType) {
                        case 'to-uppercase':
                            if (typeof dataToTransform === 'string') {
                                result = dataToTransform.toUpperCase();
                            }
                            break;
                        case 'to-lowercase':
                            if (typeof dataToTransform === 'string') {
                                result = dataToTransform.toLowerCase();
                            }
                            break;
                        case 'parse-json':
                            if (typeof dataToTransform === 'string') {
                                try {
                                    result = JSON.parse(dataToTransform);
                                } catch {
                                    result = dataToTransform;
                                }
                            }
                            break;
                        case 'stringify-json':
                            if (typeof dataToTransform === 'object') {
                                result = JSON.stringify(dataToTransform);
                            }
                            break;
                        default:
                            result = dataToTransform;
                    }
                }
                break;

            case 'condition':
                if (block.config?.conditionField && block.config?.conditionValue !== undefined) {
                    const fieldValue = result?.[block.config.conditionField];
                    const conditionMet = fieldValue === block.config.conditionValue;
                    if (!conditionMet) {
                        // Skip remaining blocks if condition not met
                        shouldStop = true;
                        result = { conditionMet: false, result };
                    }
                }
                break;

            case 'custom-code':
                // Execute custom JavaScript code
                if (block.config?.code) {
                    try {
                        // Create a safe execution context
                        const codeContext = {
                            result: result,
                            fileData: fileData,
                            context: context,
                            // Helper functions
                            console: {
                                log: (...args: any[]) => console.log('[CUSTOM CODE]', ...args),
                                error: (...args: any[]) => console.error('[CUSTOM CODE ERROR]', ...args),
                                warn: (...args: any[]) => console.warn('[CUSTOM CODE WARN]', ...args),
                            },
                            // Math and JSON helpers
                            Math: Math,
                            JSON: JSON,
                            // String helpers
                            String: String,
                            Number: Number,
                            Date: Date,
                        };

                        // Execute the code in a function context
                        const codeFunction = new Function(
                            'result', 'fileData', 'context', 'console', 'Math', 'JSON', 'String', 'Number', 'Date',
                            `return (${block.config.code});`
                        );

                        const codeResult = codeFunction.call(
                            codeContext,
                            result,
                            fileData,
                            context,
                            codeContext.console,
                            Math,
                            JSON,
                            String,
                            Number,
                            Date
                        );

                        result = codeResult !== undefined ? codeResult : result;
                        console.log(`[CUSTOM API] Custom code executed, result type: ${typeof result}`);
                    } catch (err: any) {
                        console.error(`[CUSTOM API] Error executing custom code:`, err);
                        throw new Error(`Custom code error: ${err.message}`);
                    }
                }
                break;

            case 'http-request':
                // Make HTTP request using Node.js native modules
                if (block.config?.url) {
                    try {
                        const https = require('https');
                        const http = require('http');
                        const { URL } = require('url');
                        
                        const url = new URL(block.config.url);
                        const isHttps = url.protocol === 'https:';
                        const client = isHttps ? https : http;
                        const method = block.config?.method || 'GET';
                        
                        const headers: any = {};
                        if (block.config?.headers) {
                            try {
                                const parsedHeaders = typeof block.config.headers === 'string' 
                                    ? JSON.parse(block.config.headers) 
                                    : block.config.headers;
                                Object.assign(headers, parsedHeaders);
                            } catch {
                                // Ignore invalid headers
                            }
                        }

                        const body = (block.config?.body && (method === 'POST' || method === 'PUT' || method === 'PATCH'))
                            ? (typeof block.config.body === 'string' 
                                ? block.config.body 
                                : JSON.stringify(block.config.body))
                            : undefined;

                        if (body) {
                            headers['Content-Length'] = Buffer.byteLength(body);
                            if (!headers['Content-Type']) {
                                headers['Content-Type'] = 'application/json';
                            }
                        }

                        const requestOptions = {
                            hostname: url.hostname,
                            port: url.port || (isHttps ? 443 : 80),
                            path: url.pathname + url.search,
                            method: method,
                            headers: headers,
                            timeout: block.config?.timeout || 10000,
                        };

                        result = await new Promise((resolve, reject) => {
                            const req = client.request(requestOptions, (res: any) => {
                                let data = '';
                                res.on('data', (chunk: Buffer) => {
                                    data += chunk.toString();
                                });
                                res.on('end', () => {
                                    let parsedData = data;
                                    try {
                                        parsedData = JSON.parse(data);
                                    } catch {
                                        // Keep as string if not JSON
                                    }
                                    resolve({
                                        status: res.statusCode,
                                        statusText: res.statusMessage,
                                        data: parsedData,
                                        headers: res.headers,
                                    });
                                });
                            });

                            req.on('error', (err: Error) => {
                                reject(err);
                            });

                            req.on('timeout', () => {
                                req.destroy();
                                reject(new Error('Request timeout'));
                            });

                            if (body) {
                                req.write(body);
                            }
                            req.end();
                        });

                        console.log(`[CUSTOM API] HTTP request completed: ${(result as any).status}`);
                    } catch (err: any) {
                        console.error(`[CUSTOM API] HTTP request error:`, err);
                        throw new Error(`HTTP request failed: ${err.message}`);
                    }
                }
                break;

            case 'delay':
                // Wait for specified milliseconds
                if (block.config?.delay) {
                    const delayMs = parseInt(block.config.delay) || 0;
                    if (delayMs > 0 && delayMs <= 60000) { // Max 60 seconds
                        console.log(`[CUSTOM API] Delaying for ${delayMs}ms`);
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                }
                break;

            // File Operations
            case 'file-write':
                if (block.config?.fileContent && block.config?.fileName) {
                    const crypto = require('crypto');
                    const storedName = crypto.randomBytes(16).toString('hex');
                    const buffer = Buffer.from(block.config.fileContent, 'utf8');
                    await minioClient.putObject(BUCKET_NAME, storedName, buffer, buffer.length, {
                        'Content-Type': 'text/plain',
                    });
                    result = { success: true, storedName, fileName: block.config.fileName };
                }
                break;

            case 'file-delete':
                if (block.config?.fileId) {
                    const file = await prisma.file.findUnique({ where: { id: block.config.fileId } });
                    if (file) {
                        await minioClient.removeObject(BUCKET_NAME, file.storedName);
                        await prisma.file.delete({ where: { id: block.config.fileId } });
                        result = { success: true, deleted: block.config.fileId };
                    }
                }
                break;

            // Database Operations
            case 'db-query':
                if (block.config?.dbModel && block.config?.dbWhere) {
                    const model = block.config.dbModel.toLowerCase();
                    const where = typeof block.config.dbWhere === 'string' ? JSON.parse(block.config.dbWhere) : block.config.dbWhere;
                    if (model === 'file') {
                        result = await prisma.file.findMany({ where });
                    } else if (model === 'folder') {
                        result = await prisma.folder.findMany({ where });
                    } else if (model === 'user') {
                        result = await prisma.user.findMany({ where });
                    } else if (model === 'link') {
                        result = await prisma.link.findMany({ where });
                    } else if (model === 'note') {
                        result = await prisma.note.findMany({ where });
                    }
                }
                break;

            case 'db-insert':
                if (block.config?.dbModel && block.config?.dbData) {
                    const model = block.config.dbModel.toLowerCase();
                    const data = typeof block.config.dbData === 'string' ? JSON.parse(block.config.dbData) : block.config.dbData;
                    if (model === 'file') {
                        result = await prisma.file.create({ data });
                    } else if (model === 'folder') {
                        result = await prisma.folder.create({ data });
                    } else if (model === 'link') {
                        result = await prisma.link.create({ data });
                    } else if (model === 'note') {
                        result = await prisma.note.create({ data });
                    }
                }
                break;

            case 'db-update':
                if (block.config?.dbModel && block.config?.dbWhere && block.config?.dbData) {
                    const model = block.config.dbModel.toLowerCase();
                    const where = typeof block.config.dbWhere === 'string' ? JSON.parse(block.config.dbWhere) : block.config.dbWhere;
                    const data = typeof block.config.dbData === 'string' ? JSON.parse(block.config.dbData) : block.config.dbData;
                    if (model === 'file') {
                        result = await prisma.file.updateMany({ where, data });
                    } else if (model === 'folder') {
                        result = await prisma.folder.updateMany({ where, data });
                    } else if (model === 'link') {
                        result = await prisma.link.updateMany({ where, data });
                    } else if (model === 'note') {
                        result = await prisma.note.updateMany({ where, data });
                    }
                }
                break;

            case 'db-delete':
                if (block.config?.dbModel && block.config?.dbWhere) {
                    const model = block.config.dbModel.toLowerCase();
                    const where = typeof block.config.dbWhere === 'string' ? JSON.parse(block.config.dbWhere) : block.config.dbWhere;
                    if (model === 'file') {
                        result = await prisma.file.deleteMany({ where });
                    } else if (model === 'folder') {
                        result = await prisma.folder.deleteMany({ where });
                    } else if (model === 'link') {
                        result = await prisma.link.deleteMany({ where });
                    } else if (model === 'note') {
                        result = await prisma.note.deleteMany({ where });
                    }
                }
                break;

            // Array/Object Operations
            case 'array-map':
                if (Array.isArray(result) && block.config?.mapFunction) {
                    try {
                        const func = new Function('item', 'index', 'array', `return ${block.config.mapFunction}`);
                        result = result.map((item: any, index: number) => func(item, index, result));
                    } catch (err: any) {
                        throw new Error(`Map function error: ${err.message}`);
                    }
                }
                break;

            case 'array-filter':
                if (Array.isArray(result) && block.config?.filterFunction) {
                    try {
                        const func = new Function('item', 'index', 'array', `return ${block.config.filterFunction}`);
                        result = result.filter((item: any, index: number) => func(item, index, result));
                    } catch (err: any) {
                        throw new Error(`Filter function error: ${err.message}`);
                    }
                }
                break;

            case 'array-reduce':
                if (Array.isArray(result) && block.config?.reduceFunction) {
                    try {
                        const func = new Function('acc', 'item', 'index', 'array', `return ${block.config.reduceFunction}`);
                        const initial = block.config.reduceInitial !== undefined ? block.config.reduceInitial : undefined;
                        result = result.reduce((acc: any, item: any, index: number) => func(acc, item, index, result), initial);
                    } catch (err: any) {
                        throw new Error(`Reduce function error: ${err.message}`);
                    }
                }
                break;

            case 'array-sort':
                if (Array.isArray(result)) {
                    const field = block.config?.sortField;
                    const order = block.config?.sortOrder || 'asc';
                    if (field) {
                        result.sort((a: any, b: any) => {
                            const aVal = a[field];
                            const bVal = b[field];
                            const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
                            return order === 'asc' ? comparison : -comparison;
                        });
                    } else {
                        result.sort();
                    }
                }
                break;

            case 'array-group':
                if (Array.isArray(result) && block.config?.groupField) {
                    const grouped: any = {};
                    result.forEach((item: any) => {
                        const key = item[block.config.groupField];
                        if (!grouped[key]) grouped[key] = [];
                        grouped[key].push(item);
                    });
                    result = grouped;
                }
                break;

            case 'object-merge':
                if (block.config?.mergeObjects && Array.isArray(block.config.mergeObjects)) {
                    result = block.config.mergeObjects.reduce((acc: any, obj: any) => ({ ...acc, ...obj }), result || {});
                } else if (typeof result === 'object' && typeof fileData === 'object') {
                    result = { ...result, ...fileData };
                }
                break;

            case 'object-flatten':
                if (typeof result === 'object') {
                    const flatten = (obj: any, prefix = ''): any => {
                        const flattened: any = {};
                        for (const key in obj) {
                            const newKey = prefix ? `${prefix}.${key}` : key;
                            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                                Object.assign(flattened, flatten(obj[key], newKey));
                            } else {
                                flattened[newKey] = obj[key];
                            }
                        }
                        return flattened;
                    };
                    result = flatten(result);
                }
                break;

            case 'object-pick':
                if (typeof result === 'object' && block.config?.pickFields && Array.isArray(block.config.pickFields)) {
                    const picked: any = {};
                    block.config.pickFields.forEach((field: string) => {
                        if (result[field] !== undefined) {
                            picked[field] = result[field];
                        }
                    });
                    result = picked;
                }
                break;

            // String Operations
            case 'string-replace':
                if (typeof result === 'string' && block.config?.replacePattern && block.config?.replaceValue !== undefined) {
                    const regex = new RegExp(block.config.replacePattern, 'g');
                    result = result.replace(regex, block.config.replaceValue);
                }
                break;

            case 'string-split':
                if (typeof result === 'string') {
                    const delimiter = block.config?.splitDelimiter || ',';
                    result = result.split(delimiter);
                }
                break;

            case 'string-join':
                if (Array.isArray(result)) {
                    const delimiter = block.config?.joinDelimiter || ',';
                    result = result.join(delimiter);
                }
                break;

            case 'string-regex':
                if (typeof result === 'string' && block.config?.regexPattern) {
                    const flags = block.config.regexFlags || 'g';
                    const regex = new RegExp(block.config.regexPattern, flags);
                    const matches = result.match(regex);
                    result = matches || [];
                }
                break;

            case 'string-encode':
                if (block.config?.encodeType) {
                    const str = typeof result === 'string' ? result : JSON.stringify(result);
                    if (block.config.encodeType === 'base64') {
                        result = Buffer.from(str).toString('base64');
                    } else if (block.config.encodeType === 'url') {
                        result = encodeURIComponent(str);
                    } else if (block.config.encodeType === 'uri') {
                        result = encodeURI(str);
                    }
                }
                break;

            case 'string-decode':
                if (typeof result === 'string' && block.config?.encodeType) {
                    if (block.config.encodeType === 'base64') {
                        result = Buffer.from(result, 'base64').toString('utf8');
                    } else if (block.config.encodeType === 'url') {
                        result = decodeURIComponent(result);
                    } else if (block.config.encodeType === 'uri') {
                        result = decodeURI(result);
                    }
                }
                break;

            // Math Operations
            case 'math-calculate':
                if (block.config?.mathExpression && typeof result === 'number') {
                    try {
                        const expr = block.config.mathExpression.replace(/result/g, String(result));
                        result = Function(`"use strict"; return (${expr})`)();
                    } catch (err: any) {
                        throw new Error(`Math calculation error: ${err.message}`);
                    }
                }
                break;

            case 'math-round':
                if (typeof result === 'number') {
                    const decimals = block.config?.roundDecimals || 0;
                    result = Math.round(result * Math.pow(10, decimals)) / Math.pow(10, decimals);
                }
                break;

            case 'math-random':
                const min = block.config?.randomMin || 0;
                const max = block.config?.randomMax || 100;
                result = Math.floor(Math.random() * (max - min + 1)) + min;
                break;

            // Date/Time Operations
            case 'date-format':
                if (result instanceof Date || block.config?.dateInput) {
                    const date = result instanceof Date ? result : new Date(block.config.dateInput || result);
                    const format = block.config?.dateFormat || 'ISO';
                    if (format === 'ISO') {
                        result = date.toISOString();
                    } else if (format === 'locale') {
                        result = date.toLocaleString();
                    } else {
                        // Custom format
                        result = format.replace(/YYYY/g, String(date.getFullYear()))
                            .replace(/MM/g, String(date.getMonth() + 1).padStart(2, '0'))
                            .replace(/DD/g, String(date.getDate()).padStart(2, '0'))
                            .replace(/HH/g, String(date.getHours()).padStart(2, '0'))
                            .replace(/mm/g, String(date.getMinutes()).padStart(2, '0'))
                            .replace(/ss/g, String(date.getSeconds()).padStart(2, '0'));
                    }
                }
                break;

            case 'date-parse':
                if (block.config?.dateInput) {
                    result = new Date(block.config.dateInput);
                } else if (typeof result === 'string') {
                    result = new Date(result);
                }
                break;

            case 'date-add':
                if (result instanceof Date || block.config?.dateInput) {
                    const date = result instanceof Date ? result : new Date(block.config.dateInput || result);
                    const value = block.config?.dateAddValue || 0;
                    const unit = block.config?.dateAddUnit || 'd';
                    const multipliers: any = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, M: 2592000000, y: 31536000000 };
                    result = new Date(date.getTime() + value * (multipliers[unit] || 86400000));
                }
                break;

            // Variables & State (stored in context)
            case 'set-variable':
                if (block.config?.variableName) {
                    context.variables = context.variables || {};
                    context.variables[block.config.variableName] = block.config.variableValue !== undefined ? block.config.variableValue : result;
                }
                break;

            case 'get-variable':
                if (block.config?.variableName && context.variables) {
                    result = context.variables[block.config.variableName];
                }
                break;

            // Encoding/Decoding
            case 'encode-base64':
                const toEncode = typeof result === 'string' ? result : JSON.stringify(result);
                result = Buffer.from(toEncode).toString('base64');
                break;

            case 'decode-base64':
                if (typeof result === 'string') {
                    try {
                        result = Buffer.from(result, 'base64').toString('utf8');
                        try {
                            result = JSON.parse(result);
                        } catch {
                            // Keep as string if not JSON
                        }
                    } catch (err: any) {
                        throw new Error(`Base64 decode error: ${err.message}`);
                    }
                }
                break;

            case 'hash-md5':
            case 'hash-sha256':
                const crypto = require('crypto');
                const toHash = typeof result === 'string' ? result : JSON.stringify(result);
                const algorithm = blockTypeId === 'hash-md5' ? 'md5' : 'sha256';
                result = crypto.createHash(algorithm).update(toHash).digest('hex');
                break;

            // Cache (in-memory for now)
            case 'cache-set':
                if (block.config?.cacheKey) {
                    context.cache = context.cache || {};
                    const ttl = block.config.cacheTtl || 3600000; // 1 hour default
                    context.cache[block.config.cacheKey] = {
                        value: block.config.cacheValue !== undefined ? block.config.cacheValue : result,
                        expires: Date.now() + ttl,
                    };
                }
                break;

            case 'cache-get':
                if (block.config?.cacheKey && context.cache) {
                    const cached = context.cache[block.config.cacheKey];
                    if (cached && cached.expires > Date.now()) {
                        result = cached.value;
                    } else {
                        result = null;
                    }
                }
                break;

            // Webhook
            case 'webhook-send':
                if (block.config?.webhookUrl) {
                    const https = require('https');
                    const http = require('http');
                    const { URL } = require('url');
                    const url = new URL(block.config.webhookUrl);
                    const isHttps = url.protocol === 'https:';
                    const client = isHttps ? https : http;
                    const body = JSON.stringify(result || {});
                    const options = {
                        hostname: url.hostname,
                        port: url.port || (isHttps ? 443 : 80),
                        path: url.pathname + url.search,
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
                    };
                    result = await new Promise((resolve, reject) => {
                        const req = client.request(options, (res: any) => {
                            let data = '';
                            res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
                            res.on('end', () => resolve({ status: res.statusCode, data }));
                        });
                        req.on('error', reject);
                        req.write(body);
                        req.end();
                    });
                }
                break;

            // Redirect (stored in context for response handler)
            case 'redirect':
                if (block.config?.redirectUrl) {
                    context.redirect = {
                        url: block.config.redirectUrl,
                        code: block.config.redirectCode || 302,
                    };
                }
                break;

            // Cookie (stored in context for response handler)
            case 'set-cookie':
                if (block.config?.cookieName) {
                    context.cookies = context.cookies || [];
                    context.cookies.push({
                        name: block.config.cookieName,
                        value: block.config.cookieValue || String(result),
                        options: block.config.cookieOptions || {},
                    });
                }
                break;

            case 'get-cookie':
                if (block.config?.cookieName && context.requestCookies) {
                    result = context.requestCookies[block.config.cookieName];
                }
                break;

            // Compression
            case 'compress':
            case 'decompress':
                const zlib = require('zlib');
                const data = typeof result === 'string' ? Buffer.from(result) : Buffer.from(JSON.stringify(result));
                if (blockTypeId === 'compress') {
                    result = zlib.gzipSync(data).toString('base64');
                } else {
                    result = zlib.gunzipSync(Buffer.from(result, 'base64')).toString('utf8');
                }
                break;

            // Validation
            case 'validate-schema':
            case 'validate-data':
                // Basic validation - can be extended
                if (block.config?.validationRules) {
                    const rules = typeof block.config.validationRules === 'string' ? JSON.parse(block.config.validationRules) : block.config.validationRules;
                    const errors: string[] = [];
                    for (const rule of rules) {
                        if (rule.required && !result?.[rule.field]) {
                            errors.push(`${rule.field} is required`);
                        }
                        if (rule.type && typeof result?.[rule.field] !== rule.type) {
                            errors.push(`${rule.field} must be ${rule.type}`);
                        }
                    }
                    if (errors.length > 0) {
                        throw new Error(`Validation failed: ${errors.join(', ')}`);
                    }
                }
                break;

            // Loops
            case 'loop-foreach':
                if (Array.isArray(result) && block.config?.loopFunction) {
                    try {
                        const func = new Function('item', 'index', 'array', 'result', `return ${block.config.loopFunction}`);
                        const newResult: any[] = [];
                        for (let i = 0; i < result.length; i++) {
                            const itemResult = func(result[i], i, result, newResult);
                            newResult.push(itemResult);
                        }
                        result = newResult;
                    } catch (err: any) {
                        throw new Error(`Loop function error: ${err.message}`);
                    }
                }
                break;

            // Switch Case
            case 'switch-case':
                if (block.config?.switchField && block.config?.switchCases) {
                    const fieldValue = result?.[block.config.switchField];
                    const cases = typeof block.config.switchCases === 'string' ? JSON.parse(block.config.switchCases) : block.config.switchCases;
                    result = cases[fieldValue] || cases.default || result;
                }
                break;

            // Error Handling
            case 'try-catch':
                // This would need special handling in the execution flow
                // For now, we'll just continue
                break;

            case 'throw-error':
                if (block.config?.errorMessage) {
                    throw new Error(block.config.errorMessage);
                }
                break;

            case 'response':
                // Response block - use the current result
                // The result is already set by previous blocks
                break;
        }
    }

    return result;
};

// Dynamic route handler for custom APIs
// This must be the last route to catch all /api/custom/* paths
router.use(async (req, res, next) => {
    try {
        // req.path will be like "/api/data.json" when accessed via /api/custom/api/data.json
        // Express strips the mount path, so /api/custom/api/data.json becomes /api/data.json in the router
        const endpoint = req.path;
        
        console.log(`[CUSTOM API] Request: ${req.method} ${endpoint}`);
        
        // Find the API flow by endpoint and method
        // Try multiple variations to handle different endpoint formats
        let flow = await prisma.apiFlow.findFirst({
            where: {
                deployed: true,
                endpoint: endpoint,
                method: req.method,
            },
        });

        // If not found, try without leading slash
        if (!flow && endpoint.startsWith('/')) {
            flow = await prisma.apiFlow.findFirst({
                where: {
                    deployed: true,
                    endpoint: endpoint.substring(1),
                    method: req.method,
                },
            });
        }

        // If still not found, try with leading slash
        if (!flow && !endpoint.startsWith('/')) {
            flow = await prisma.apiFlow.findFirst({
                where: {
                    deployed: true,
                    endpoint: `/${endpoint}`,
                    method: req.method,
                },
            });
        }

        // If still not found, try matching by removing /api prefix from endpoint
        // This handles cases where endpoint is stored as "/api/data" but accessed as "/api/data"
        if (!flow && endpoint.startsWith('/api/')) {
            const withoutApi = endpoint.substring(4); // Remove "/api"
            flow = await prisma.apiFlow.findFirst({
                where: {
                    deployed: true,
                    OR: [
                        { endpoint: withoutApi },
                        { endpoint: `/${withoutApi}` },
                    ],
                    method: req.method,
                },
            });
        }

        // If still not found, try matching where stored endpoint contains the request path
        if (!flow) {
            flow = await prisma.apiFlow.findFirst({
                where: {
                    deployed: true,
                    method: req.method,
                    OR: [
                        { endpoint: { contains: endpoint } },
                        { endpoint: { contains: endpoint.substring(1) } },
                    ],
                },
            });
        }

        if (!flow) {
            // Log all deployed flows for debugging
            const allFlows = await prisma.apiFlow.findMany({
                where: { deployed: true },
                select: { id: true, name: true, endpoint: true, method: true },
            });
            console.log(`[CUSTOM API] Flow not found for endpoint: ${endpoint}, method: ${req.method}`);
            console.log(`[CUSTOM API] Available deployed flows:`, allFlows.map(f => ({ 
                endpoint: f.endpoint, 
                method: f.method,
                name: f.name 
            })));
            return res.status(404).json({ 
                message: 'API endpoint not found',
                debug: process.env.NODE_ENV !== 'production' ? { 
                    requestedEndpoint: endpoint,
                    requestedMethod: req.method,
                    availableFlows: allFlows.map(f => ({ endpoint: f.endpoint, method: f.method }))
                } : undefined
            });
        }

        console.log(`[CUSTOM API] Found flow: ${flow.name} (${flow.id})`);

        // Parse policies
        const policies = typeof flow.policies === 'string' 
            ? JSON.parse(flow.policies) 
            : flow.policies;

        // Check password if required
        if (policies.requirePassword && policies.password) {
            const providedPassword = req.headers['x-api-password'] as string || 
                                   req.query.password as string ||
                                   (req.body && req.body.password);
            
            if (!providedPassword) {
                return res.status(401).json({ message: 'Password required' });
            }

            const isValid = await verifyPassword(policies.password, providedPassword);
            if (!isValid) {
                return res.status(401).json({ message: 'Invalid password' });
            }
        }

        // Check API key authentication if required
        if (policies.requireAuth) {
            const apiKey = req.headers['x-api-key'] as string || 
                          req.headers['authorization']?.replace('Bearer ', '') ||
                          req.query.apiKey as string;

            if (!apiKey || apiKey !== flow.apiKey) {
                return res.status(401).json({ message: 'Invalid or missing API key' });
            }
        }

        // Check rate limit
        if (policies.rateLimit) {
            const apiKey = flow.apiKey || 'anonymous';
            if (!checkRateLimit(apiKey, policies.rateLimit)) {
                return res.status(429).json({ 
                    message: 'Rate limit exceeded',
                    retryAfter: 60 
                });
            }
        }

        // Check CORS origins
        const origin = req.headers.origin;
        if (policies.allowedOrigins && policies.allowedOrigins.length > 0) {
            if (origin && !policies.allowedOrigins.includes(origin)) {
                return res.status(403).json({ message: 'Origin not allowed' });
            }
        } else if (origin) {
            // Allow the origin if no restrictions
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        } else {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }

        // Parse blocks
        const blocks = typeof flow.blocks === 'string' 
            ? JSON.parse(flow.blocks) 
            : flow.blocks;

        const selectedFiles = typeof flow.selectedFiles === 'string'
            ? JSON.parse(flow.selectedFiles)
            : flow.selectedFiles;

        // Execute blocks
        const context = {
            selectedFiles,
            requestBody: req.body,
            query: req.query,
            params: req.params,
        };

        const result = await executeBlocks(blocks, context);

        console.log(`[CUSTOM API] Execution result:`, result !== null && result !== undefined ? (typeof result === 'object' ? `object with ${Object.keys(result).length} keys` : `value of type ${typeof result}`) : 'null/undefined');

        // Check if result is a file to stream
        if (result && result.type === 'file') {
            try {
                const fileStream = await minioClient.getObject(BUCKET_NAME, result.storedName);
                res.setHeader('Content-Type', result.mimeType || 'application/octet-stream');
                res.setHeader('Content-Disposition', `inline; filename="${result.fileName}"`);
                fileStream.pipe(res);
                return;
            } catch (err: any) {
                throw new Error(`Failed to stream file: ${err.message}`);
            }
        }

        // Determine response format
        const responseBlock = blocks.find((b: any) => b.id === 'response');
        const responseFormat = responseBlock?.config?.responseFormat || 'json';

        console.log(`[CUSTOM API] Response format: ${responseFormat}, result is: ${result !== null && result !== undefined ? 'present' : 'null/undefined'}`);

        // Set appropriate headers
        if (responseFormat === 'json') {
            res.setHeader('Content-Type', 'application/json');
            // If result is null/undefined, check if we have fileData from file-read
            if (result === null || result === undefined) {
                console.warn(`[CUSTOM API] Result is null/undefined, returning default message`);
                res.json({ message: 'API executed successfully', warning: 'No data returned from blocks' });
            } else {
                res.json(result);
            }
        } else if (responseFormat === 'file') {
            // If result is a file, stream it
            res.setHeader('Content-Type', 'application/octet-stream');
            res.send(result);
        } else {
            res.setHeader('Content-Type', 'text/plain');
            res.send(String(result !== null && result !== undefined ? result : 'OK'));
        }

    } catch (err: any) {
        console.error('[CUSTOM API] Error executing flow:', err);
        res.status(500).json({ 
            message: 'Error executing API flow',
            error: process.env.NODE_ENV === 'production' ? undefined : err.message 
        });
    }
});

export default router;

