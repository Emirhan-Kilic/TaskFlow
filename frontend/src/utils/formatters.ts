export function formatFileSize(bytes: bigint): string {
    const kb = Number(bytes) / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    const mb = kb / 1024;
    return `${Math.round(mb)} MB`;
}

export function formatDate(date: string | null): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString();
} 