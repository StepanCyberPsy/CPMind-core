export function deliveryAssetKey(
    sha256: string,
    extension: string,
): string {
    return `assets/sha256/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.${extension}`;
}

// HTML5-бандл раздаётся распакованным: относительные ссылки внутри index.html
// разрешаются только при общем префиксе для всех файлов дерева
export function html5BundleKey(
    bundleSha256: string,
    relativePath: string,
): string {
    return `html5/${bundleSha256.slice(0, 2)}/${bundleSha256.slice(2, 4)}/${bundleSha256}/${relativePath}`;
}