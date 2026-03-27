/**
 * Centralized configuration for application limits.
 * These values can be overridden by environment variables.
 */

export const LIMITS = {
    // Bandwidth Limits (in KB/s)
    // Default: 100 MB/s (102400 KB/s) - increased for large file uploads
    MAX_UPLOAD_SPEED: parseInt(process.env.MAX_UPLOAD_SPEED || '102400'),
    MAX_DOWNLOAD_SPEED: parseInt(process.env.MAX_DOWNLOAD_SPEED || '102400'),

    // Default Storage Limit (in bytes)
    // Default: 50 GB
    DEFAULT_STORAGE_LIMIT: BigInt(process.env.DEFAULT_STORAGE_LIMIT || '53687091200'),
};
