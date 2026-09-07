export function deliveryAssetKey(
    sha256: string,
    extension: string,
): string {
    return `assets/sha256/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.${extension}`;
}