'use client';

import {
    useCallback,
    useRef,
    useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { createUploadSession, completeUploadSession } from '@/lib/admin/api';
import { uploadFile } from '@/lib/admin/upload-api';
import { ProcessingPoller } from './ProcessingPoller';
import type { CampaignRow } from '@/lib/admin/api';
import type { CreativeType } from '@cpmind/shared';
import styles from '@/styles/upload-flow.module.css';

const ACCEPTED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'text/html',
    'application/zip',
    'application/x-zip-compressed',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-msvideo',
];

function detectCreativeType(file: File): CreativeType | null {
    const mime = file.type.toLowerCase();
    const name = file.name.toLowerCase();

    if (mime === 'image/gif') return 'banner_gif';

    if (
        mime === 'image/jpeg' ||
        mime === 'image/png' ||
        mime === 'image/webp' ||
        mime === 'image/svg+xml'
    ) return 'banner_static';

    if (
        mime === 'application/zip' ||
        mime === 'application/x-zip-compressed' ||
        name.endsWith('.zip')
    ) return 'banner_html5';

    if (
        mime === 'text/html' ||
        name.endsWith('.html') ||
        name.endsWith('.htm')
    ) return 'banner_html5';

    if (
        mime === 'video/mp4' ||
        mime === 'video/quicktime' ||
        mime === 'video/webm' ||
        mime === 'video/x-msvideo'
    ) return 'video_creative';

    return null;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Phase =
    | 'idle'
    | 'uploading'
    | 'processing'
    | 'done'
    | 'error';

interface Props {
    campaigns: CampaignRow[];
    onDone?: ((creativeVersionUuid: string) => void) | undefined;
    redirectOnDone?: string | undefined;
}

export function UploadFlow({ campaigns, onDone, redirectOnDone }: Props): React.ReactElement {
    const [campaignUuid, setCampaignUuid] = useState<string>(
        campaigns[0]?.uuid ?? '',
    );
    const [file, setFile] = useState<File | null>(null);
    const [dragging, setDragging] = useState(false);
    const [phase, setPhase] = useState<Phase>('idle');
    const [uploadPct, setUploadPct] = useState(0);
    const [uploadId, setUploadId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const handleFile = useCallback((incoming: File) => {
        if (!ACCEPTED_MIME_TYPES.includes(incoming.type.toLowerCase()) &&
            !incoming.name.toLowerCase().endsWith('.zip')) {
            setError(`Неподдерживаемый тип файла: ${incoming.type || 'unknown'}`);
            return;
        }
        setFile(incoming);
        setError(null);
    }, []);

    const onDropzoneClick = (): void => fileInputRef.current?.click();

    const onFileInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const f = e.target.files?.[0];
        if (f) handleFile(f);
        e.target.value = '';
    };

    const onDragOver = (e: React.DragEvent): void => {
        e.preventDefault();
        setDragging(true);
    };

    const onDragLeave = (): void => setDragging(false);

    const onDrop = (e: React.DragEvent): void => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
    };

    const removeFile = (): void => {
        setFile(null);
        setError(null);
    };

    const startUpload = async (): Promise<void> => {
        if (file === null || campaignUuid === '') return;

        const creativeType = detectCreativeType(file);
        if (creativeType === null) {
            setError('Не удалось определить тип creative по файлу');
            return;
        }

        setPhase('uploading');
        setUploadPct(0);
        setError(null);

        const ac = new AbortController();
        abortRef.current = ac;

        try {
            const session = await createUploadSession({
                campaignUuid,
                creativeType,
                filename: file.name,
                sizeBytes: file.size,
                mimeType: file.type || 'application/octet-stream',
            });

            setUploadId(session.uploadId);

            const parts = await uploadFile(
                session,
                file,
                setUploadPct,
                ac.signal,
            );

            await completeUploadSession(
                session.uploadId,
                parts !== null ? parts : undefined,
            );

            setPhase('processing');

        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                setPhase('idle');
                setUploadId(null);
                return;
            }
            setPhase('error');
            setError(err instanceof Error ? err.message : 'Ошибка загрузки');
        }
    };

    const cancelUpload = (): void => {
        abortRef.current?.abort();
        abortRef.current = null;
    };

    const router = useRouter();

    const handlePollerReady = useCallback((creativeVersionUuid: string): void => {
        setPhase('done');
        onDone?.(creativeVersionUuid);
        if (redirectOnDone !== undefined) {
            router.push(`${redirectOnDone}${creativeVersionUuid}`);
        }
    }, [onDone, redirectOnDone, router]);

    const handlePollerFailed = useCallback((processingError: string | null): void => {
        setPhase('error');
        setError(processingError ?? 'Ошибка обработки файла');
    }, []);

    const reset = (): void => {
        setPhase('idle');
        setFile(null);
        setUploadId(null);
        setUploadPct(0);
        setError(null);
    };

    if (campaigns.length === 0) {
        return (
            <div className={styles.errorBox}>
                Нет активных кампаний. Создайте кампанию перед загрузкой.
            </div>
        );
    }

    return (
        <div className={styles.root}>
            {phase === 'idle' || phase === 'error' ? (
                <>
                    <div className={styles.section}>
                        <label className={styles.label} htmlFor="upload-campaign">
                            Кампания
                        </label>
                        <select
                            id="upload-campaign"
                            className={styles.select}
                            value={campaignUuid}
                            onChange={(e) => setCampaignUuid(e.target.value)}
                        >
                            {campaigns.map((c) => (
                                <option key={c.uuid} value={c.uuid}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.section}>
                        <span className={styles.label}>Файл</span>
                        {file === null ? (
                            <div
                                className={`${styles.dropzone} ${dragging ? styles.dropzoneDragging : ''}`}
                                onClick={onDropzoneClick}
                                onDragOver={onDragOver}
                                onDragLeave={onDragLeave}
                                onDrop={onDrop}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => e.key === 'Enter' && onDropzoneClick()}
                                aria-label="Выбрать файл для загрузки"
                            >
                                <span className={styles.dropzoneIcon} aria-hidden="true">
                                    ↑
                                </span>
                                <span className={styles.dropzoneText}>
                                    Перетащите файл или нажмите для выбора
                                </span>
                                <span className={styles.dropzoneHint}>
                                    JPEG, PNG, WebP, GIF, SVG, HTML5 ZIP, MP4
                                </span>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    className={styles.fileInput}
                                    accept={ACCEPTED_MIME_TYPES.join(',')}
                                    onChange={onFileInput}
                                    tabIndex={-1}
                                    aria-hidden="true"
                                />
                            </div>
                        ) : (
                            <div className={styles.fileInfo}>
                                <span className={styles.fileName}>{file.name}</span>
                                <span className={styles.fileSize}>{formatBytes(file.size)}</span>
                                <button
                                    type="button"
                                    className={styles.removefile}
                                    onClick={removeFile}
                                    aria-label="Убрать файл"
                                >
                                    ×
                                </button>
                            </div>
                        )}
                    </div>

                    {error !== null && (
                        <div className={styles.errorBox}>{error}</div>
                    )}

                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.primaryBtn}
                            onClick={() => { void startUpload(); }}
                            disabled={file === null || campaignUuid === ''}
                        >
                            Загрузить
                        </button>
                    </div>
                </>
            ) : null}

            {phase === 'uploading' && (
                <div className={styles.section}>
                    <span className={styles.label}>Загрузка файла</span>
                    <div className={styles.progressBar}>
                        <div
                            className={styles.progressFill}
                            style={{ width: `${uploadPct}%` }}
                            role="progressbar"
                            aria-valuenow={uploadPct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                        />
                    </div>
                    <div className={styles.progressLabel}>{uploadPct}%</div>
                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={cancelUpload}
                        >
                            Отменить
                        </button>
                    </div>
                </div>
            )}

            {phase === 'processing' && uploadId !== null && (
                <ProcessingPoller
                    uploadId={uploadId}
                    onReady={handlePollerReady}
                    onFailed={handlePollerFailed}
                />
            )}

            {phase === 'done' && (
                <div className={styles.section}>
                    <div className={styles.successBox}>
                        Файл успешно обработан и готов к размещению.
                    </div>
                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.ghostBtn}
                            onClick={reset}
                        >
                            Загрузить ещё
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}