import { Transform, TransformCallback } from 'stream';

export class ThrottledStream extends Transform {
    private bytesPerSecond: number;
    private lastChunkTime: number;
    private sentBytes: number;

    constructor(bytesPerSecond: number) {
        super();
        this.bytesPerSecond = bytesPerSecond;
        this.lastChunkTime = Date.now();
        this.sentBytes = 0;
    }

    _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
        if (this.bytesPerSecond <= 0) {
            this.push(chunk);
            return callback();
        }

        const chunkSize = chunk.length;
        this.sentBytes += chunkSize;

        const now = Date.now();
        const elapsed = now - this.lastChunkTime;

        // Expected time to send these bytes
        const expectedTime = (chunkSize / this.bytesPerSecond) * 1000;

        // If we are sending acceptable rate, just push
        if (elapsed >= expectedTime) {
            this.lastChunkTime = now;
            this.push(chunk);
            callback();
        } else {
            // We are too fast, wait the difference
            const delay = expectedTime - elapsed;
            setTimeout(() => {
                this.lastChunkTime = Date.now();
                this.push(chunk);
                callback();
            }, delay);
        }
    }
}
