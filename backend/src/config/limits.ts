/**
 * Centralized configuration for application limits.
 * These values can be overridden by environment variables.
 */

export const LIMITS = {
    // Bandwidth Limits (in KB/s)
    // Default: 10 MB/s (10240 KB/s)
    MAX_UPLOAD_SPEED: parseInt(process.env.MAX_UPLOAD_SPEED || '10240'),
    MAX_DOWNLOAD_SPEED: parseInt(process.env.MAX_DOWNLOAD_SPEED || '10240'),

    // Default Storage Limit (in bytes)
    // Default: 50 GB
    DEFAULT_STORAGE_LIMIT: BigInt(process.env.DEFAULT_STORAGE_LIMIT || '53687091200'),
};
