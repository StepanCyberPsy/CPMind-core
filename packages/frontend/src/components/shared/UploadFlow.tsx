'use client';

import {
    useCallback,
    useRef,
    useState,
} from 'react';
import { useRouter } from 'next/navigation';
import {
    createUploadSession,
    completeUploadSession,
    createExternalVastCreative,
} from '@/lib/admin/api';
import { uploadFile } from '@/lib/admin/upload-api';
import { ProcessingPoller } from './ProcessingPoller';
import { buildDefaultCreativeName } from '@/lib/config';
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

function getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.slice(lastDot) : '';
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

// Файл загружается и обрабатывается; внешний VAST-тег только регистрируется —
// CPMind оборачивает указанный адрес своим Wrapper при выдаче
type CreativeSource = 'file' | 'external_vast';

interface Props {
    campaigns: CampaignRow[];
    onDone?: ((creativeUuid: string) => void) | undefined;
}

export function UploadFlow({ campaigns, onDone }: Props): React.ReactElement {
    const router = useRouter();

    const [campaignUuid, setCampaignUuid] = useState<string>(
        campaigns[0]?.uuid ?? '',
    );
    // Источник креатива. Внешний тег не проходит загрузку и обработку:
    // версия создаётся сразу готовой, поэтому ветки не пересекаются
    const [source, setSource] = useState<CreativeSource>('file');
    const [vastTagUrl, setVastTagUrl] = useState('');
    const [vastClickUrl, setVastClickUrl] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [creativeName, setCreativeName] = useState('');
    const [dragging, setDragging] = useState(false);
    const [phase, setPhase] = useState<Phase>('idle');
    const [uploadPct, setUploadPct] = useState(0);
    const [uploadId, setUploadId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const selectedCampaign = campaigns.find((c) => c.uuid === campaignUuid);

    const handleFile = useCallback((incoming: File): void => {
        if (
            !ACCEPTED_MIME_TYPES.includes(incoming.type.toLowerCase()) &&
            !incoming.name.toLowerCase().endsWith('.zip')
        ) {
            setError(`Неподдерживаемый тип файла: ${incoming.type || 'unknown'}`);
            return;
        }

        setFile(incoming);
        setError(null);

        if (creativeName === '' && selectedCampaign !== undefined) {
            const detectedType = detectCreativeType(incoming);
            if (detectedType !== null) {
                setCreativeName(buildDefaultCreativeName(selectedCampaign.name, detectedType));
            }
        }
    }, [creativeName, selectedCampaign]);

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

    const submitExternalVast = async (): Promise<void> => {
        if (campaignUuid === '') return;

        const trimmedName = creativeName.trim();
        if (trimmedName === '') {
            setError('Укажите название creative');
            return;
        }

        const trimmedUrl = vastTagUrl.trim();
        if (trimmedUrl === '') {
            setError('Укажите адрес VAST-тега');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const trimmedClickUrl = vastClickUrl.trim();
            const created = await createExternalVastCreative({
                campaignUuid,
                name: trimmedName,
                vastTagUrl: trimmedUrl,
                ...(trimmedClickUrl !== '' && { clickUrl: trimmedClickUrl }),
            });

            setPhase('done');

            if (onDone !== undefined) {
                onDone(created.creativeUuid);
            } else {
                router.refresh();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось создать креатив');
        } finally {
            setSubmitting(false);
        }
    };

    const startUpload = async (): Promise<void> => {
        if (file === null || campaignUuid === '') return;

        const creativeType = detectCreativeType(file);
        if (creativeType === null) {
            setError('Не удалось определить тип creative по файлу');
            return;
        }

        const trimmedName = creativeName.trim();
        if (trimmedName === '') {
            setError('Укажите название creative');
            return;
        }

        setPhase('uploading');
        setUploadPct(0);
        setError(null);

        const ac = new AbortController();
        abortRef.current = ac;

        // Имя передаётся через filename: backend применяет creativeNameFromFilename()
        const ext = getFileExtension(file.name);
        const filenameWithName = `${trimmedName}${ext}`;

        try {
            const session = await createUploadSession({
                campaignUuid,
                creativeType,
                filename: filenameWithName,
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

    const handlePollerReady = useCallback(({ creativeUuid }: { creativeUuid: string; creativeVersionUuid: string }): void => {
        setPhase('done');
        onDone?.(creativeUuid);
        router.push(`/creatives/${creativeUuid}`);
    }, [onDone, router]);

    const handlePollerFailed = useCallback((processingError: string | null): void => {
        setPhase('error');
        setError(processingError ?? 'Ошибка обработки файла');
    }, []);

    const reset = (): void => {
        setPhase('idle');
        setVastTagUrl('');
        setVastClickUrl('');
        setFile(null);
        setUploadId(null);
        setUploadPct(0);
        setError(null);
        setCreativeName('');
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
                        <span className={styles.label}>Кампания</span>
                        {campaigns.length === 1 ? (
                            <div className={styles.campaignDisplay}>
                                <span className={styles.campaignName}>
                                    {campaigns[0]?.name ?? ''}
                                </span>
                                <span className={styles.campaignLock}>зафиксирована</span>
                            </div>
                        ) : (
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
                        )}
                    </div>

                    <div className={styles.section}>
                        <span className={styles.label}>Источник креатива</span>
                        <div className={styles.sourceToggle} role="radiogroup" aria-label="Источник креатива">
                            <button
                                type="button"
                                role="radio"
                                aria-checked={source === 'file'}
                                className={`${styles.sourceOption} ${source === 'file' ? styles.sourceOptionActive : ''}`}
                                onClick={() => { setSource('file'); setError(null); }}
                            >
                                Загрузить файл
                            </button>
                            <button
                                type="button"
                                role="radio"
                                aria-checked={source === 'external_vast'}
                                className={`${styles.sourceOption} ${source === 'external_vast' ? styles.sourceOptionActive : ''}`}
                                onClick={() => { setSource('external_vast'); setError(null); }}
                            >
                                Внешний VAST-тег
                            </button>
                        </div>
                    </div>

                    {source === 'external_vast' ? (
                        <>
                            <div className={styles.section}>
                                <label className={styles.label} htmlFor="vast-tag-url">
                                    Адрес VAST-тега
                                </label>
                                <input
                                    id="vast-tag-url"
                                    type="url"
                                    className={styles.textInput}
                                    value={vastTagUrl}
                                    onChange={(e) => setVastTagUrl(e.target.value)}
                                    placeholder="https://adserver.example/vast?..."
                                    maxLength={2048}
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                                <span className={styles.fieldHint}>
                                    Тег вашего адсервера. CPMind обернёт его своим VAST Wrapper
                                    и добавит трекинг и блок верификации — исходный тег остаётся
                                    без изменений. Адрес должен быть доступен по https
                                    с площадок размещения.
                                </span>
                            </div>

                            <div className={styles.section}>
                                <label className={styles.label} htmlFor="vast-name">
                                    Название creative
                                </label>
                                <input
                                    id="vast-name"
                                    type="text"
                                    className={styles.textInput}
                                    value={creativeName}
                                    onChange={(e) => setCreativeName(e.target.value)}
                                    placeholder="Название для идентификации в кабинете"
                                    maxLength={255}
                                />
                            </div>

                            <div className={styles.section}>
                                <label className={styles.label} htmlFor="vast-click-url">
                                    Click URL
                                </label>
                                <input
                                    id="vast-click-url"
                                    type="url"
                                    className={styles.textInput}
                                    value={vastClickUrl}
                                    onChange={(e) => setVastClickUrl(e.target.value)}
                                    placeholder="Не обязательно"
                                    maxLength={2048}
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                                <span className={styles.fieldHint}>
                                    Заполняйте, только если переход должен вести не на ту
                                    страницу, которая указана в самом теге.
                                </span>
                            </div>

                            {error !== null && (
                                <div className={styles.errorBox}>{error}</div>
                            )}

                            <div className={styles.actions}>
                                <button
                                    type="button"
                                    className={styles.primaryBtn}
                                    onClick={() => { void submitExternalVast(); }}
                                    disabled={
                                        submitting ||
                                        campaignUuid === '' ||
                                        creativeName.trim() === '' ||
                                        vastTagUrl.trim() === ''
                                    }
                                >
                                    {submitting ? 'Создание…' : 'Создать креатив'}
                                </button>
                            </div>
                        </>
                    ) : (
                    <>
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

                    {file !== null && (
                        <div className={styles.section}>
                            <label className={styles.label} htmlFor="upload-name">
                                Название creative
                            </label>
                            <input
                                id="upload-name"
                                type="text"
                                className={styles.select}
                                value={creativeName}
                                onChange={(e) => setCreativeName(e.target.value)}
                                placeholder="Название для идентификации в кабинете"
                                maxLength={255}
                            />
                        </div>
                    )}

                    {error !== null && (
                        <div className={styles.errorBox}>{error}</div>
                    )}

                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.primaryBtn}
                            onClick={() => { void startUpload(); }}
                            disabled={file === null || campaignUuid === '' || creativeName.trim() === ''}
                        >
                            Загрузить
                        </button>
                    </div>
                    </>
                    )}
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
                        {source === 'external_vast'
                            ? 'Креатив создан и готов к размещению.'
                            : 'Файл успешно обработан и готов к размещению.'}
                    </div>
                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.ghostBtn}
                            onClick={reset}
                        >
                            {source === 'external_vast' ? 'Создать ещё' : 'Загрузить ещё'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}