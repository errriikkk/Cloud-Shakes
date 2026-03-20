"use client";

import { useEffect, useRef, useState } from "react";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import { cn } from "@/lib/utils";

type Props = {
    isOpen: boolean;
    imageFile: File | null;
    onClose: () => void;
    onCropped: (blob: Blob) => void;
};

export function AvatarCropModal({ isOpen, imageFile, onClose, onCropped }: Props) {
    const [zoom, setZoom] = useState(1.2);
    const [pos, setPos] = useState({ x: 0, y: 0 }); // px translate in preview space
    const [dragging, setDragging] = useState(false);
    const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
    const [objectUrl, setObjectUrl] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const last = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        if (!isOpen || !imageFile) return;
        setZoom(1.2);
        setPos({ x: 0, y: 0 });
        const url = URL.createObjectURL(imageFile);
        setObjectUrl(url);
        const img = new Image();
        img.src = url;
        img.onload = () => setImgEl(img);
        img.onerror = () => setImgEl(null);

        return () => {
            URL.revokeObjectURL(url);
            setObjectUrl(null);
            setImgEl(null);
        };
    }, [isOpen, imageFile]);

    const canSave = !!imgEl;

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!containerRef.current) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        last.current = { x: e.clientX, y: e.clientY };
    };
    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragging || !last.current) return;
        const dx = e.clientX - last.current.x;
        const dy = e.clientY - last.current.y;
        last.current = { x: e.clientX, y: e.clientY };
        setPos(p => ({ x: p.x + dx, y: p.y + dy }));
    };
    const handlePointerUp = () => {
        setDragging(false);
        last.current = null;
    };

    const cropToBlob = async () => {
        if (!imgEl || !containerRef.current) return;

        // Output constraints: square 512x512, jpeg
        const outSize = 512;
        const canvas = document.createElement("canvas");
        canvas.width = outSize;
        canvas.height = outSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // We render the same transform as preview into a square output:
        // Fit image so that shortest side covers the crop square, then apply zoom + translate.
        const rect = containerRef.current.getBoundingClientRect();
        const cropSize = Math.min(rect.width, rect.height);

        // base scale to cover square
        const baseScale = Math.max(cropSize / imgEl.width, cropSize / imgEl.height);
        const scale = baseScale * zoom;

        // draw image centered with user translation
        const drawW = imgEl.width * scale;
        const drawH = imgEl.height * scale;
        const centerX = (cropSize - drawW) / 2 + pos.x;
        const centerY = (cropSize - drawH) / 2 + pos.y;

        // We draw to an intermediate square (cropSize), then scale to output.
        const tmp = document.createElement("canvas");
        tmp.width = cropSize;
        tmp.height = cropSize;
        const tctx = tmp.getContext("2d");
        if (!tctx) return;
        tctx.fillStyle = "#000";
        tctx.fillRect(0, 0, cropSize, cropSize);
        tctx.drawImage(imgEl, centerX, centerY, drawW, drawH);

        ctx.drawImage(tmp, 0, 0, outSize, outSize);

        const blob: Blob | null = await new Promise(resolve =>
            canvas.toBlob(b => resolve(b), "image/jpeg", 0.9)
        );
        if (blob) onCropped(blob);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Recortar foto / Crop photo" width="max-w-xl">
            <div className="space-y-5">
                <div className="flex items-start gap-4">
                    <div
                        ref={containerRef}
                        className={cn(
                            "relative w-64 h-64 sm:w-72 sm:h-72 rounded-[2rem] overflow-hidden border border-border/60 bg-muted/40",
                            "touch-none select-none"
                        )}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                    >
                        {imgEl ? (
                            <img
                                src={objectUrl || imgEl.src}
                                alt="crop"
                                className="absolute top-1/2 left-1/2 will-change-transform"
                                style={{
                                    transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${zoom})`,
                                }}
                                draggable={false}
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground font-semibold">
                                Loading…
                            </div>
                        )}

                        {/* WhatsApp-like mask */}
                        <div className="absolute inset-0 pointer-events-none">
                            <div className="absolute inset-0 bg-black/25" />
                            <div className="absolute inset-6 rounded-full border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                        </div>
                    </div>

                    <div className="flex-1 space-y-4">
                        <p className="text-xs text-muted-foreground">
                            Arrastra para encuadrar. Ajusta el zoom y guarda.
                            <br />
                            Drag to reposition. Adjust zoom and save.
                        </p>
                        <div className="space-y-2">
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Zoom</p>
                            <Slider
                                value={[zoom]}
                                min={1}
                                max={2.5}
                                step={0.01}
                                onValueChange={(v) => setZoom(v[0] ?? 1.2)}
                            />
                        </div>
                    </div>
                </div>

                <ModalFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={cropToBlob} disabled={!canSave}>Save</Button>
                </ModalFooter>
            </div>
        </Modal>
    );
}

