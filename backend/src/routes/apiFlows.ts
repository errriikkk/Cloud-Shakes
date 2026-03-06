import express from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { protect, AuthRequest } from '../middleware/authMiddleware';
import { hashPassword, verifyPassword } from '../utils/auth';
import crypto from 'crypto';

const router = express.Router();

const createApiFlowSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    blocks: z.array(z.any()).optional(),
    endpoint: z.string().optional(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
    policies: z.object({
        requireAuth: z.boolean().optional(),
        rateLimit: z.number().optional(),
        allowedOrigins: z.array(z.string()).optional(),
        requirePassword: z.boolean().optional(),
        password: z.string().optional(),
        maxFileSize: z.number().optional(),
        allowedMimeTypes: z.array(z.string()).optional(),
    }).optional(),
    selectedFiles: z.array(z.string()).optional(),
});

const updateApiFlowSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    blocks: z.array(z.any()).optional(),
    endpoint: z.string().optional(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
    deployed: z.boolean().optional(),
    policies: z.object({
        requireAuth: z.boolean().optional(),
        rateLimit: z.number().optional(),
        allowedOrigins: z.array(z.string()).optional(),
        requirePassword: z.boolean().optional(),
        password: z.string().optional(),
        maxFileSize: z.number().optional(),
        allowedMimeTypes: z.array(z.string()).optional(),
    }).optional(),
    selectedFiles: z.array(z.string()).optional(),
});

// Generate API key
const generateApiKey = (): string => {
    return `sk_${crypto.randomBytes(16).toString('hex')}`;
};

// @route   GET /api/api-flows
// @desc    List all API flows for the current user
// @access  Private
router.get('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const flows = await prisma.apiFlow.findMany({
            where: { ownerId: req.user.id },
            orderBy: { updatedAt: 'desc' },
        });

        // Parse JSON fields
        const flowsWithParsed = flows.map(flow => ({
            ...flow,
            blocks: typeof flow.blocks === 'string' ? JSON.parse(flow.blocks as string) : flow.blocks,
            policies: typeof flow.policies === 'string' ? JSON.parse(flow.policies as string) : flow.policies,
            selectedFiles: typeof flow.selectedFiles === 'string' ? JSON.parse(flow.selectedFiles as string) : flow.selectedFiles,
        }));

        res.json(flowsWithParsed);
    } catch (err) {
        next(err);
    }
});

// @route   POST /api/api-flows
// @desc    Create a new API flow
// @access  Private
router.post('/', protect, async (req: AuthRequest, res, next) => {
    try {
        const data = createApiFlowSchema.parse(req.body);

        const flow = await prisma.apiFlow.create({
            data: {
                name: data.name,
                description: data.description || '',
                blocks: data.blocks || [],
                endpoint: data.endpoint || null,
                method: data.method || 'GET',
                policies: data.policies || {
                    requireAuth: false,
                    rateLimit: 60,
                    allowedOrigins: [],
                    requirePassword: false,
                },
                selectedFiles: data.selectedFiles || [],
                ownerId: req.user.id,
            },
        });

        // Parse JSON fields for response
        const flowWithParsed = {
            ...flow,
            blocks: typeof flow.blocks === 'string' ? JSON.parse(flow.blocks as string) : flow.blocks,
            policies: typeof flow.policies === 'string' ? JSON.parse(flow.policies as string) : flow.policies,
            selectedFiles: typeof flow.selectedFiles === 'string' ? JSON.parse(flow.selectedFiles as string) : flow.selectedFiles,
        };

        res.json(flowWithParsed);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: (error as any).errors });
        }
        next(error);
    }
});

// @route   GET /api/api-flows/:id
// @desc    Get a single API flow
// @access  Private
router.get('/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const flow = await prisma.apiFlow.findUnique({
            where: { id: req.params.id as string },
        });

        if (!flow) {
            return res.status(404).json({ message: 'API flow not found' });
        }

        if (flow.ownerId !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Parse JSON fields
        const flowWithParsed = {
            ...flow,
            blocks: typeof flow.blocks === 'string' ? JSON.parse(flow.blocks as string) : flow.blocks,
            policies: typeof flow.policies === 'string' ? JSON.parse(flow.policies as string) : flow.policies,
            selectedFiles: typeof flow.selectedFiles === 'string' ? JSON.parse(flow.selectedFiles as string) : flow.selectedFiles,
        };

        res.json(flowWithParsed);
    } catch (err) {
        next(err);
    }
});

// @route   PUT /api/api-flows/:id
// @desc    Update an API flow
// @access  Private
router.put('/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const data = updateApiFlowSchema.parse(req.body);

        const existing = await prisma.apiFlow.findUnique({
            where: { id: req.params.id as string },
        });

        if (!existing) {
            return res.status(404).json({ message: 'API flow not found' });
        }

        if (existing.ownerId !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // If deploying, generate API key and URL if not exists
        let updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.blocks !== undefined) updateData.blocks = data.blocks;
        if (data.endpoint !== undefined) updateData.endpoint = data.endpoint;
        if (data.method !== undefined) updateData.method = data.method;
        if (data.selectedFiles !== undefined) updateData.selectedFiles = data.selectedFiles;
        // Always update blocks when deploying to ensure they're saved
        if (data.deployed && existing.blocks) {
            updateData.blocks = existing.blocks; // Keep existing blocks if not provided
        }
        if (data.policies !== undefined) {
            updateData.policies = data.policies;
            // Hash password if provided
            if (data.policies.requirePassword && data.policies.password) {
                updateData.policies.password = await hashPassword(data.policies.password);
            }
        }

        // Handle deployment
        if (data.deployed !== undefined) {
            updateData.deployed = data.deployed;
            if (data.deployed && !existing.apiKey) {
                // Generate API key and URL when deploying
                const apiKey = generateApiKey();
                updateData.apiKey = apiKey;
                const baseUrl = process.env.API_URL || process.env.FRONTEND_URL?.replace('cloud.', 'api.') || 'http://localhost:5000';
                updateData.apiUrl = `${baseUrl}/api/custom${data.endpoint || existing.endpoint || ''}`;
            } else if (!data.deployed) {
                // When undeploying, keep the API key but mark as not deployed
                // Optionally, you could remove the API key here
            }
        }

        const updated = await prisma.apiFlow.update({
            where: { id: req.params.id as string },
            data: updateData,
        });

        // Parse JSON fields for response
        const flowWithParsed = {
            ...updated,
            blocks: typeof updated.blocks === 'string' ? JSON.parse(updated.blocks as string) : updated.blocks,
            policies: typeof updated.policies === 'string' ? JSON.parse(updated.policies as string) : updated.policies,
            selectedFiles: typeof updated.selectedFiles === 'string' ? JSON.parse(updated.selectedFiles as string) : updated.selectedFiles,
        };

        res.json(flowWithParsed);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: (error as any).errors });
        }
        next(error);
    }
});

// @route   POST /api/api-flows/preview
// @desc    Preview API flow execution (without deploying)
// @access  Private
router.post('/preview', protect, async (req: AuthRequest, res, next) => {
    try {
        const { blocks, selectedFiles, method } = req.body;

        if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
            return res.status(400).json({ message: 'Blocks are required' });
        }

        // Import executeBlocks from custom.ts
        const { executeBlocks } = await import('./custom');
        
        const context = {
            selectedFiles: selectedFiles || [],
            requestBody: {},
            query: {},
            params: {},
        };

        // Execute blocks
        const result = await executeBlocks(blocks, context);

        // Determine response format from response block
        const responseBlock = blocks.find((b: any) => b.id === 'response' || b.blockType === 'response');
        const responseFormat = responseBlock?.config?.responseFormat || 'json';

        res.json({
            success: true,
            data: result,
            format: responseFormat,
            preview: true,
        });
    } catch (error: any) {
        console.error('[PREVIEW] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error executing preview',
        });
    }
});

// @route   DELETE /api/api-flows/:id
// @desc    Delete an API flow
// @access  Private
router.delete('/:id', protect, async (req: AuthRequest, res, next) => {
    try {
        const flow = await prisma.apiFlow.findUnique({
            where: { id: req.params.id as string },
        });

        if (!flow) {
            return res.status(404).json({ message: 'API flow not found' });
        }

        if (flow.ownerId !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await prisma.apiFlow.delete({
            where: { id: req.params.id as string },
        });

        res.json({ message: 'API flow deleted' });
    } catch (err) {
        next(err);
    }
});

export default router;

