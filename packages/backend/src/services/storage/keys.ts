// Staging
export function stagingObjectKey(
    uploadSessionId: string,
    filename: string,
): string {
    return `staging/${uploadSessionId}/${filename}`;
}

// Delivery — content-addressed с SHA-256 prefix sharding
export function deliveryAssetKey(
    sha256: string,
    extension: string,
): string {
    return `assets/sha256/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.${extension}`;
}