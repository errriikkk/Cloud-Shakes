export function showPermissionDenied(message: string, permission?: string) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent("permissionDenied", {
            detail: { message, permission }
        })
    );
}
