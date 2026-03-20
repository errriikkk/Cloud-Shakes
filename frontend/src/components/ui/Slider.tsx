import * as React from "react";
import { cn } from "@/lib/utils";

export type SliderProps = {
  value: number[];
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onValueChange?: (value: number[]) => void;
  className?: string;
};

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  onValueChange,
  className,
}: SliderProps) {
  const v = value?.[0] ?? min;

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={v}
      disabled={disabled}
      onChange={(e) => onValueChange?.([Number(e.target.value)])}
      className={cn(
        "w-full h-2 rounded-full bg-muted/60 outline-none accent-primary disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    />
  );
}

