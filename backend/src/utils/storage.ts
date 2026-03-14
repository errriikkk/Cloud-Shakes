import * as Minio from 'minio';

const MINIO_ROOT_USER = process.env.MINIO_ROOT_USER;
const MINIO_ROOT_PASSWORD = process.env.MINIO_ROOT_PASSWORD;

if (!MINIO_ROOT_USER || !MINIO_ROOT_PASSWORD) {
    throw new Error('MINIO_ROOT_USER and MINIO_ROOT_PASSWORD environment variables are required');
}

const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: false,
    accessKey: MINIO_ROOT_USER,
    secretKey: MINIO_ROOT_PASSWORD,
});

const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'my-cloud-files';

/**
 * Initialize storage: create bucket if needed and enforce private-only policy.
 */
export const initStorage = async () => {
    try {
        const exists = await minioClient.bucketExists(BUCKET_NAME);
        if (!exists) {
            await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
            console.log(`✅ Bucket ${BUCKET_NAME} created.`);
        }

        // Enforce private-only bucket policy — deny all public access
        const privateBucketPolicy = JSON.stringify({
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'DenyPublicAccess',
                    Effect: 'Deny',
                    Principal: '*',
                    Action: ['s3:GetObject'],
                    Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`],
                    Condition: {
                        StringNotEquals: {
                            'aws:PrincipalType': 'IAMUser'
                        }
                    }
                }
            ]
        });

        try {
            await minioClient.setBucketPolicy(BUCKET_NAME, privateBucketPolicy);
            console.log(`🔒 Bucket ${BUCKET_NAME} set to private-only.`);
        } catch (policyErr) {
            // Some MinIO versions handle policies differently — log but don't crash
            console.warn('⚠️ Could not set bucket policy (this is often fine):', (policyErr as Error).message);
        }

    } catch (err) {
        console.error('Error initializing storage:', err);
    }
};

/**
 * Generate a presigned URL for secure, time-limited file access.
 * Expiry reduced to 15 minutes (was 1 hour) for better security.
 */
export const getPresignedUrl = async (objectName: string, expiry: number = 900, options: any = {}) => {
    const externalHost = process.env.MINIO_EXTERNAL_ENDPOINT;

    if (externalHost) {
        // Use internal MinIO client to generate the URL, then replace host with external
        const port = parseInt(process.env.MINIO_EXTERNAL_PORT || '9000');

        const clientOptions: Minio.ClientOptions = {
            endPoint: 'minio', // Internal Docker network endpoint
            useSSL: false,
            accessKey: process.env.MINIO_ROOT_USER || 'minioadmin',
            secretKey: process.env.MINIO_ROOT_PASSWORD || 'miniopassword',
            region: 'us-east-1'
        };

        // Only include port if it is NOT the default
        if (port !== 9000 && port !== 80) {
            clientOptions.port = port;
        }

        const signingClient = new Minio.Client(clientOptions);
        try {
            // Generate URL with internal host, then replace with external
            let url = await signingClient.presignedGetObject(BUCKET_NAME, objectName, expiry, options);
            
            // Replace internal hostname with external hostname
            url = url.replace(/minio:[0-9]+/, externalHost);
            url = url.replace(/http:\/\/[^/]+/, `https://${externalHost}`);
            
            return url;
        } catch (err) {
            console.error('[STORAGE] Error generating external presigned URL:', err);
            throw err;
        }
    }

    return await minioClient.presignedGetObject(BUCKET_NAME, objectName, expiry, options);
};

export { minioClient, BUCKET_NAME };
