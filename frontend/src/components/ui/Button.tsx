import { ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { VariantProps, cva } from "class-variance-authority";
import { showPermissionDenied } from "@/lib/permissionFeedback";

const buttonVariants = cva(
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default:
                    "bg-primary text-primary-foreground shadow-sm hover:opacity-90 border border-transparent",
                destructive:
                    "bg-red-50 text-red-600 hover:bg-red-100 border border-red-100",
                outline:
                    "border border-border/60 bg-transparent shadow-sm hover:bg-muted hover:text-foreground",
                secondary:
                    "bg-muted text-foreground shadow-sm hover:bg-muted/80",
                ghost: "hover:bg-muted hover:text-foreground border border-transparent",
                link: "text-primary underline-offset-4 hover:underline",
                premium: "bg-primary text-white shadow-xl shadow-primary/10 hover:opacity-90",
            },
            size: {
                default: "h-9 px-4 py-2",
                sm: "h-8 rounded-md px-3 text-xs",
                lg: "h-10 rounded-md px-8",
                icon: "h-9 w-9",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

export interface ButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    isLoading?: boolean;
    blockedReason?: string;
    blockedPermission?: string;
    showBlockedFeedback?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, isLoading, children, blockedReason, blockedPermission, showBlockedFeedback, onClick, ...props }, ref) => {
        const isBlocked = !!props.disabled && !!showBlockedFeedback;
        const hardDisabled = isLoading || (!!props.disabled && !isBlocked);
        return (
            <button
                className={cn(
                    buttonVariants({ variant, size, className }),
                    isBlocked && "opacity-50 cursor-not-allowed"
                )}
                ref={ref}
                disabled={hardDisabled}
                aria-disabled={isBlocked ? true : undefined}
                onClick={(e) => {
                    if (isBlocked) {
                        e.preventDefault();
                        e.stopPropagation();
                        showPermissionDenied(
                            blockedReason || "No tienes permisos para esta accion.",
                            blockedPermission
                        );
                        return;
                    }
                    onClick?.(e);
                }}
                {...props}
            >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {children}
            </button>
        );
    }
);
Button.displayName = "Button";

export { Button, buttonVariants };
