// Клиент IAB поставляется как собранный JavaScript без деклараций типов.
// Объявляется только то, что используется; фактический контракт описан
// в OMID API 1.5 и продублирован в types.ts
declare module '@iabtechlab-omsdk/open-measurement/omsdk-js/Verification-Client/omid-verification-client-v1.js' {
    export const OmidVerificationClient: {
        new (): {
            isSupported(): boolean;
            registerSessionObserver(
                observer: (event: unknown) => void,
                vendorKey?: string,
            ): void;
            addEventListener(type: string, listener: (event: unknown) => void): void;
        };
    };
}
