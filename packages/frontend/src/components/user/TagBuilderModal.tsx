'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Combobox } from '@/components/shared/Combobox';
import { fetchMyTags } from '@/lib/user/api';
import {
    TAG_BUILDER_CREATIVE_TYPES,
    TAG_BUILDER_DEFAULT_FORMAT,
    TAG_BUILDER_DEFAULT_FORM_STATE,
    TAG_BUILDER_DEFAULT_PLATFORM,
    TAG_BUILDER_ENDPOINT,
    TAG_BUILDER_FORMAT_OPTIONS,
    TAG_BUILDER_ID_PATTERN,
    TAG_BUILDER_PLATFORM_OPTIONS,
    TAG_BUILDER_SCRIPT_SRC,
    getTagBuilderDefaultFormat,
    getTagBuilderPlatformOption,
} from '@/lib/shared/tag-builder';
import type {
    TagBuilderCopyTarget,
    TagBuilderFormat,
    TagBuilderFormErrors,
    TagBuilderGeneratedCode,
    TagBuilderPlatform,
} from '@/lib/shared/tag-builder';
import type {
    TagBuilderCreativeType,
    TagBuilderFormState,
    TagBuilderModalProps,
    TagBuilderStep,
} from '@/lib/user/types';
import styles from '@/styles/tag-builder-modal.module.css';

function cx(...classes: Array<string | false | null | undefined>): string {
    return classes.filter((item): item is string => typeof item === 'string').join(' ');
}

function getFormatLabel(format: TagBuilderFormat): string {
    const option = TAG_BUILDER_FORMAT_OPTIONS.find((item) => item.value === format);
    return option?.label ?? format;
}

function escapeHtmlAttr(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function escapePythonString(value: string): string {
    return value
        .replaceAll('\\', '\\\\')
        .replaceAll('"', '\\"');
}

function validateForm(form: TagBuilderFormState): TagBuilderFormErrors {
    const errors: TagBuilderFormErrors = {};
    const width = Number(form.width);
    const height = Number(form.height);

    if (!TAG_BUILDER_ID_PATTERN.test(form.campaignId)) {
        errors.campaignId = 'Только латиница, цифры и _, максимум 100 символов';
    }

    if (!TAG_BUILDER_ID_PATTERN.test(form.creativeId)) {
        errors.creativeId = 'Только латиница, цифры и _, максимум 100 символов';
    }

    if (!Number.isInteger(width) || width < 1 || width > 10000) {
        errors.width = 'Укажите целое число от 1 до 10000';
    }

    if (!Number.isInteger(height) || height < 1 || height > 10000) {
        errors.height = 'Укажите целое число от 1 до 10000';
    }

    return errors;
}

function buildHtmlContainer(
    form: TagBuilderFormState,
    tagUuid: string,
): string {
    return `<div
  data-cpmind-creative
  data-tag-uuid="${escapeHtmlAttr(tagUuid)}"
  data-campaign-id="${escapeHtmlAttr(form.campaignId)}"
  data-creative-id="${escapeHtmlAttr(form.creativeId)}"
  data-creative-type="${form.creativeType}"
  data-endpoint="${TAG_BUILDER_ENDPOINT}"
  style="width: ${form.width}px; height: ${form.height}px;"
>
  <!-- Вставьте сюда существующий код баннера -->
${form.creativeType === 'video_creative'
    ? `  <!-- Необязательно: если в видео есть кнопка «Пропустить», добавьте атрибут data-cpmind-skip -->\n  <!-- Пример: <button data-cpmind-skip>Пропустить</button> -->`
    : ''}
</div>`;
}

function buildPhpContainer(
    form: TagBuilderFormState,
    tagUuid: string,
    platform: TagBuilderPlatform,
): string {
    const header = platform === 'bitrix_component'
        ? '<?if(!defined("B_PROLOG_INCLUDED") || B_PROLOG_INCLUDED!==true)die();?>\n'
        : '';

    return `${header}<div
  data-cpmind-creative
  data-tag-uuid="<?=htmlspecialcharsbx('${escapeHtmlAttr(tagUuid)}')?>"
  data-campaign-id="<?=htmlspecialcharsbx('${escapeHtmlAttr(form.campaignId)}')?>"
  data-creative-id="<?=htmlspecialcharsbx('${escapeHtmlAttr(form.creativeId)}')?>"
  data-creative-type="${form.creativeType}"
  data-endpoint="${TAG_BUILDER_ENDPOINT}"
  style="width: ${form.width}px; height: ${form.height}px;"
>
  <!-- Вставьте сюда существующий код баннера -->
${form.creativeType === 'video_creative'
    ? `  <!-- Необязательно: если в видео есть кнопка «Пропустить», добавьте атрибут data-cpmind-skip -->\n  <!-- Пример: <button data-cpmind-skip>Пропустить</button> -->`
    : ''}
</div>`;
}

function buildJsxContainer(
    form: TagBuilderFormState,
    tagUuid: string,
): string {
    return `<div
  data-cpmind-creative=""
  data-tag-uuid="${escapeHtmlAttr(tagUuid)}"
  data-campaign-id="${escapeHtmlAttr(form.campaignId)}"
  data-creative-id="${escapeHtmlAttr(form.creativeId)}"
  data-creative-type="${form.creativeType}"
  data-endpoint="${TAG_BUILDER_ENDPOINT}"
  style={{ width: ${form.width}, height: ${form.height} }}
>
  {/* Вставьте сюда существующий код баннера */}
${form.creativeType === 'video_creative'
    ? `  {/* Необязательно: если в видео есть кнопка «Пропустить», добавьте data-cpmind-skip */}\n  {/* Пример: <button data-cpmind-skip>Пропустить</button> */}`
    : ''}
</div>`;
}

function buildPythonContainer(
    form: TagBuilderFormState,
    tagUuid: string,
): string {
    return `tag_container_html = f"""
<div
  data-cpmind-creative
  data-tag-uuid="${escapePythonString(tagUuid)}"
  data-campaign-id="${escapePythonString(form.campaignId)}"
  data-creative-id="${escapePythonString(form.creativeId)}"
  data-creative-type="${form.creativeType}"
  data-endpoint="${TAG_BUILDER_ENDPOINT}"
  style="width: ${form.width}px; height: ${form.height}px;"
>
  <!-- Вставьте сюда существующий код баннера -->
${form.creativeType === 'video_creative'
    ? `  <!-- Необязательно: если в видео есть кнопка «Пропустить», добавьте data-cpmind-skip -->\n  <!-- Пример: <button data-cpmind-skip>Пропустить</button> -->`
    : ''}
</div>
"""`;
}

function buildScript(
    platform: TagBuilderPlatform,
    format: TagBuilderFormat,
): string {
    if (format === 'jsx') {
        return `<Script
  src="${TAG_BUILDER_SCRIPT_SRC}"
  strategy="afterInteractive"
/>`;
    }

    if (format === 'python') {
        return `tag_script_html = '<script async src="${TAG_BUILDER_SCRIPT_SRC}"></script>'`;
    }

    if (platform === 'bitrix' || platform === 'bitrix_component' || platform === 'wordpress') {
        return `<script async src="<?=htmlspecialchars('${TAG_BUILDER_SCRIPT_SRC}', ENT_QUOTES)?>"></script>`;
    }

    return `<script async src="${TAG_BUILDER_SCRIPT_SRC}"></script>`;
}

function generateCode(
    form: TagBuilderFormState,
    tagUuid: string,
    platform: TagBuilderPlatform,
    format: TagBuilderFormat,
): TagBuilderGeneratedCode {
    if (format === 'php') {
        return {
            container: buildPhpContainer(
                form,
                tagUuid,
                platform,
            ),
            script: buildScript(
                platform,
                format,
            ),
        };
    }

    if (format === 'jsx') {
        return {
            container: buildJsxContainer(
                form,
                tagUuid,
            ),
            script: buildScript(
                platform,
                format,
            ),
        };
    }

    if (format === 'python') {
        return {
            container: buildPythonContainer(
                form,
                tagUuid,
            ),
            script: buildScript(
                platform,
                format,
            ),
        };
    }

    return {
        container: buildHtmlContainer(
            form,
            tagUuid,
        ),
        script: buildScript(
            platform,
            format,
        ),
    };
}

async function copyText(value: string): Promise<void> {
    if (navigator.clipboard !== undefined) {
        await navigator.clipboard.writeText(value);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

export function TagBuilderModal({
    open,
    onClose,
    initialCampaignId,
}: TagBuilderModalProps) {
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);

    const [step, setStep] = useState<TagBuilderStep>('params');
    const [form, setForm] = useState<TagBuilderFormState>(() => ({
        ...TAG_BUILDER_DEFAULT_FORM_STATE,
        ...(initialCampaignId !== undefined && { campaignId: initialCampaignId }),
    }));
    const [errors, setErrors] = useState<TagBuilderFormErrors>({});
    const [tagUuid, setTagUuid] = useState<string | null>(null);
    const [loadingTags, setLoadingTags] = useState(false);
    const [tagsError, setTagsError] = useState<string | null>(null);
    const [platform, setPlatform] = useState<TagBuilderPlatform>(TAG_BUILDER_DEFAULT_PLATFORM);
    const [format, setFormat] = useState<TagBuilderFormat>(TAG_BUILDER_DEFAULT_FORMAT);
    const [copiedTarget, setCopiedTarget] = useState<TagBuilderCopyTarget | null>(null);

    const selectedPlatform = useMemo(() => {
        return getTagBuilderPlatformOption(platform);
    }, [platform]);

    const currentErrors = useMemo(() => {
        return validateForm(form);
    }, [form]);

    const generatedCode = useMemo(() => {
        if (tagUuid === null) {
            return {
                container: '',
                script: '',
            };
        }

        return generateCode(
            form,
            tagUuid,
            platform,
            format,
        );
    }, [form, tagUuid, platform, format]);

    const hasFormErrors = Object.keys(currentErrors).length > 0;
    const canProceed = tagUuid !== null && !loadingTags && tagsError === null && !hasFormErrors;

    useEffect(() => {
        if (!open) return;

        setStep('params');
        setErrors({});
        setCopiedTarget(null);
        setTagsError(null);
        setPlatform(TAG_BUILDER_DEFAULT_PLATFORM);
        setFormat(TAG_BUILDER_DEFAULT_FORMAT);
        setForm({
            ...TAG_BUILDER_DEFAULT_FORM_STATE,
            ...(initialCampaignId !== undefined && { campaignId: initialCampaignId }),
        });

        window.requestAnimationFrame(() => {
            closeButtonRef.current?.focus();
        });
    }, [open, initialCampaignId]);

    useEffect(() => {
        if (!open) return;

        let cancelled = false;

        async function loadTags(): Promise<void> {
            setLoadingTags(true);
            setTagsError(null);

            try {
                const tags = await fetchMyTags();
                const activeTag = tags.find((tag) => tag.isActive);

                if (cancelled) return;

                if (activeTag === undefined) {
                    setTagUuid(null);
                    setTagsError('Не удалось подготовить код тега. Обратитесь к администратору CPMind.');
                    return;
                }

                setTagUuid(activeTag.uuid);
            } catch {
                if (cancelled) return;

                setTagUuid(null);
                setTagsError('Не удалось подготовить код тега. Проверьте сессию и повторите попытку.');
            } finally {
                if (!cancelled) setLoadingTags(false);
            }
        }

        void loadTags();

        return () => {
            cancelled = true;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;

        function onKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') onClose();
        }

        document.addEventListener('keydown', onKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    useEffect(() => {
        if (copiedTarget === null) return;

        const timerId = window.setTimeout(() => setCopiedTarget(null), 1500);
        return () => window.clearTimeout(timerId);
    }, [copiedTarget]);

    function updateForm<K extends keyof TagBuilderFormState>(
        key: K,
        value: TagBuilderFormState[K],
    ): void {
        setForm((prev) => ({
            ...prev,
            [key]: value,
        }));

        setErrors((prev) => {
            if (prev[key as keyof TagBuilderFormErrors] === undefined) return prev;

            const next = { ...prev };
            delete next[key as keyof TagBuilderFormErrors];
            return next;
        });
    }

    function onPlatformChange(nextPlatform: TagBuilderPlatform): void {
        setPlatform(nextPlatform);
        setFormat(getTagBuilderDefaultFormat(nextPlatform));
    }

    function onNextClick(): void {
        const nextErrors = validateForm(form);
        setErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0 || tagUuid === null || tagsError !== null) return;

        setStep('code');
    }

    async function onCopy(
        target: TagBuilderCopyTarget,
        value: string,
    ): Promise<void> {
        await copyText(value);
        setCopiedTarget(target);
    }

    if (!open) return null;

    return (
        <div className={styles.overlay} onMouseDown={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="tag-builder-title"
                className={styles.modal}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header className={styles.header}>
                    <div>
                        <p className={styles.eyebrow}>Два шага, чтобы собрать тег</p>
                        <h2 id="tag-builder-title" className={styles.title}>
                            Сборка кода тега
                        </h2>
                    </div>

                    <button
                        ref={closeButtonRef}
                        type="button"
                        className={styles.closeButton}
                        onClick={onClose}
                        aria-label="Закрыть"
                    >
                        ×
                    </button>
                </header>

                <div className={styles.steps}>
                    <button
                        type="button"
                        className={cx(
                            styles.stepButton,
                            step === 'params' ? styles.stepButtonActive : undefined,
                        )}
                        onClick={() => setStep('params')}
                    >
                        <span className={styles.stepIndex}>1</span>
                        Параметры
                    </button>

                    <button
                        type="button"
                        className={cx(
                            styles.stepButton,
                            step === 'code' ? styles.stepButtonActive : undefined,
                        )}
                        onClick={onNextClick}
                        disabled={!canProceed}
                    >
                        <span className={styles.stepIndex}>2</span>
                        Код
                    </button>
                </div>

                <div className={styles.content}>
                    {step === 'params' ? (
                        <section className={styles.formGrid}>
                            {loadingTags ? (
                                <div className={styles.infoBanner}>
                                    Подготавливаем данные тега...
                                </div>
                            ) : null}
                            {tagsError !== null ? (
                                <div className={styles.errorBanner}>
                                    {tagsError}
                                </div>
                            ) : null}

                            <label className={styles.field}>
                                <span className={styles.label}>Campaign ID</span>
                                <input
                                    value={form.campaignId}
                                    onChange={(event) => updateForm('campaignId', event.target.value)}
                                    placeholder="summer_sale_2026"
                                />
                                {errors.campaignId !== undefined ? (
                                    <span className={styles.fieldError}>{errors.campaignId}</span>
                                ) : null}
                            </label>

                            <label className={styles.field}>
                                <span className={styles.label}>Creative ID</span>
                                <input
                                    value={form.creativeId}
                                    onChange={(event) => updateForm('creativeId', event.target.value)}
                                    placeholder="banner_728x90_v1"
                                />
                                {errors.creativeId !== undefined ? (
                                    <span className={styles.fieldError}>{errors.creativeId}</span>
                                ) : null}
                            </label>

                            <div className={styles.field}>
                                <span className={styles.label}>Тип креатива</span>
                                <Combobox
                                    value={form.creativeType}
                                    onChange={(value) => updateForm('creativeType', value as TagBuilderCreativeType)}
                                    options={TAG_BUILDER_CREATIVE_TYPES.map((item) => ({
                                        value: item,
                                        label: item,
                                    }))}
                                    includeAll={false}
                                    placeholder="Выберите тип баннера"
                                />
                            </div>

                            <div className={styles.sizeGrid}>
                                <label className={styles.field}>
                                    <span className={styles.label}>Width, px</span>
                                    <input
                                        value={form.width}
                                        inputMode="numeric"
                                        onChange={(event) => updateForm('width', event.target.value)}
                                    />
                                    {errors.width !== undefined ? (
                                        <span className={styles.fieldError}>{errors.width}</span>
                                    ) : null}
                                </label>

                                <label className={styles.field}>
                                    <span className={styles.label}>Height, px</span>
                                    <input
                                        value={form.height}
                                        inputMode="numeric"
                                        onChange={(event) => updateForm('height', event.target.value)}
                                    />
                                    {errors.height !== undefined ? (
                                        <span className={styles.fieldError}>{errors.height}</span>
                                    ) : null}
                                </label>
                            </div>
                            <div className={styles.instructionCard}>
                                {form.creativeType === 'video_creative'
                                    ? 'На следующем шаге CPMind сформирует контейнер тега. Внутрь контейнера нужно будет вставить код видеобаннера. Если в видео есть кнопка «Пропустить», добавьте на неё атрибут data-cpmind-skip — это позволит системе зафиксировать факт пропуска.'
                                    : 'На следующем шаге CPMind сформирует контейнер тега. Внутрь контейнера нужно будет вставить существующий код вашего баннера.'}
                            </div>
                        </section>
                    ) : (
                        <section className={styles.codeLayout}>
                            <aside className={styles.platformPanel}>
                                <h3 className={styles.panelTitle}>Платформа</h3>

                                <div className={styles.platformList}>
                                    {TAG_BUILDER_PLATFORM_OPTIONS.map((item) => (
                                        <button
                                            key={item.value}
                                            type="button"
                                            className={cx(
                                                styles.platformButton,
                                                platform === item.value ? styles.platformButtonActive : undefined,
                                            )}
                                            onClick={() => onPlatformChange(item.value)}
                                        >
                                            <span className={styles.platformLabel}>{item.label}</span>
                                            <span className={styles.platformDescription}>{item.description}</span>
                                        </button>
                                    ))}
                                </div>

                                <div className={styles.formatBlock}>
                                    <span className={styles.label}>Формат</span>
                                    <div className={styles.formatTabs}>
                                        {selectedPlatform.formats.map((item) => (
                                            <button
                                                key={item}
                                                type="button"
                                                className={cx(
                                                    styles.formatButton,
                                                    format === item ? styles.formatButtonActive : undefined,
                                                )}
                                                onClick={() => setFormat(item)}
                                            >
                                                {getFormatLabel(item)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </aside>

                            <div className={styles.codePanel}>
                                <CodeBlock
                                    title="1. Контейнер баннера"
                                    description="Вставьте вокруг существующего баннера."
                                    code={generatedCode.container}
                                    copied={copiedTarget === 'container'}
                                    onCopy={() => onCopy(
                                        'container',
                                        generatedCode.container,
                                    )}
                                />

                                <CodeBlock
                                    title="2. Подключение версии тега"
                                    description="Добавляется один раз в конце страницы перед закрывающим body."
                                    code={generatedCode.script}
                                    copied={copiedTarget === 'script'}
                                    onCopy={() => onCopy(
                                        'script',
                                        generatedCode.script,
                                    )}
                                />
                            </div>
                        </section>
                    )}
                </div>

                <footer className={styles.footer}>
                    {step === 'code' ? (
                        <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => setStep('params')}
                        >
                            Назад
                        </button>
                    ) : (
                        <span className={styles.footerHint}>
                            Укажите понятные названия кампании и баннера. Они будут отображаться в аналитике.
                        </span>
                    )}

                    <div className={styles.footerActions}>
                        <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={onClose}
                        >
                            Закрыть
                        </button>

                        {step === 'params' ? (
                            <button
                                type="button"
                                className={styles.primaryButton}
                                onClick={onNextClick}
                                disabled={!canProceed}
                            >
                                Сформировать код
                            </button>
                        ) : null}
                    </div>
                </footer>
            </div>
        </div>
    );
}

interface CodeBlockProps {
    title: string;
    description: string;
    code: string;
    copied: boolean;
    onCopy: () => Promise<void>;
}

function CodeBlock({
    title,
    description,
    code,
    copied,
    onCopy,
}: CodeBlockProps) {
    return (
        <section className={styles.codeBlock}>
            <div className={styles.codeHeader}>
                <div>
                    <h3 className={styles.codeTitle}>{title}</h3>
                    <p className={styles.codeDescription}>{description}</p>
                </div>

                <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => void onCopy()}
                    aria-label="Скопировать код"
                >
                    {copied ? (
                        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={styles.copyIcon}>
                            <path d="M4.5 10.5L8 14L15.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={styles.copyIcon}>
                            <rect x="7" y="3" width="9" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M5 13H4C2.9 13 2 12.1 2 11V5C2 3.9 2.9 3 4 3H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    )}
                </button>
            </div>

            <pre className={styles.pre}>
                <code>{code}</code>
            </pre>
        </section>
    );
}