export interface ScannedFile {
    file: File;
    path: string; // Relative path from the dropped folder
}

export async function scanItems(items: DataTransferItemList): Promise<ScannedFile[]> {
    const scannedFiles: ScannedFile[] = [];

    const traverseEntry = async (entry: any, path: string = "") => {
        if (entry.isFile) {
            const file = await new Promise<File>((resolve, reject) => {
                entry.file(resolve, reject);
            });
            scannedFiles.push({ file, path });
        } else if (entry.isDirectory) {
            const directoryReader = entry.createReader();
            const entries = await new Promise<any[]>((resolve, reject) => {
                const result: any[] = [];
                const readBatch = () => {
                    directoryReader.readEntries((batch: any[]) => {
                        if (batch.length === 0) {
                            resolve(result);
                        } else {
                            result.push(...batch);
                            readBatch();
                        }
                    }, reject);
                };
                readBatch();
            });

            for (const childEntry of entries) {
                await traverseEntry(childEntry, path ? `${path}/${entry.name}` : entry.name);
            }
        }
    };

    const promises: Promise<void>[] = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
            const entry = item.webkitGetAsEntry();
            if (entry) {
                promises.push(traverseEntry(entry));
            }
        }
    }

    await Promise.all(promises);
    return scannedFiles;
}
