import type { Session } from '../types.js';
import { computeActiveTimeMsInRange } from '../session.js';

const OVERLAY_STYLES: Partial<CSSStyleDeclaration> = {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    zIndex: '2147483647',
    backgroundColor: 'rgba(15, 18, 26, 0.96)',
    color: '#f1f5f9',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    fontSize: '11px',
    lineHeight: '1.6',
    padding: '10px 14px',
    borderRadius: '8px',
    width: 'min(380px, calc(100vw - 32px))',
    boxSizing: 'border-box',
    boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
    pointerEvents: 'auto',
    userSelect: 'none',
};

const BUTTON_STYLES: Partial<CSSStyleDeclaration> = {
    appearance: 'none',
    border: '1px solid #334155',
    backgroundColor: '#111827',
    color: '#cbd5e1',
    borderRadius: '5px',
    height: '26px',
    padding: '0 8px',
    font: 'inherit',
    lineHeight: '24px',
    cursor: 'pointer',
    boxSizing: 'border-box',
};

const LABEL_COLOR = '#64748b';
const VALUE_COLOR = '#32d345';
const WARN_COLOR = '#fb923c';
const HEADER_COLOR = '#f1f5f9';
const BORDER_COLOR = '#1e293b';
const MUTED_COLOR = '#475569';
const PANEL_BACKGROUND = '#0f121a';

function applyStyles(
    el: HTMLElement,
    styles: Partial<CSSStyleDeclaration>,
): void {
    for (const [key, value] of Object.entries(styles)) {
        if (value === undefined || value === null) continue;
        (el.style as unknown as Record<string, string>)[key] = String(value);
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function createButton(text: string, ariaLabel: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('aria-label', ariaLabel);
    applyStyles(button, BUTTON_STYLES);
    return button;
}

interface DebugEntry {
    id: number;
    creativeEl: HTMLElement;
    session: Session;
}

let nextEntryId = 1;
let overlayManager: DebugOverlayManager | null = null;

class DebugOverlayManager {
    private readonly el: HTMLDivElement;
    private readonly countEl: HTMLSpanElement;
    private readonly previousButton: HTMLButtonElement;
    private readonly nextButton: HTMLButtonElement;
    private readonly collapseButton: HTMLButtonElement;
    private readonly selectorButton: HTMLButtonElement;
    private readonly locateButton: HTMLButtonElement;
    private readonly toolbarEl: HTMLDivElement;
    private readonly metricsEl: HTMLDivElement;
    private readonly footerEl: HTMLDivElement;
    private readonly selectorEl: HTMLDivElement;
    private readonly searchInput: HTMLInputElement;
    private readonly selectorListEl: HTMLDivElement;
    private readonly highlightEl: HTMLDivElement;
    private readonly highlightLabelEl: HTMLDivElement;
    private readonly entries: DebugEntry[] = [];
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private activeIndex = 0;
    private expanded = true;
    private selectorOpen = false;
    private disposed = false;

    constructor() {
        this.el = document.createElement('div');
        this.el.id = 'cpmind-debug-overlay';
        this.el.tabIndex = 0;
        this.el.setAttribute('role', 'region');
        this.el.setAttribute('aria-label', 'CPMind Debug');
        applyStyles(this.el, OVERLAY_STYLES);

        const headerEl = document.createElement('div');
        applyStyles(headerEl, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            paddingBottom: '6px',
            borderBottom: `1px solid ${BORDER_COLOR}`,
        });

        const titleEl = document.createElement('div');
        titleEl.textContent = 'CPMind Debug';
        applyStyles(titleEl, {
            color: HEADER_COLOR,
            fontWeight: 'bold',
            flex: '1',
            minWidth: '0',
        });

        this.countEl = document.createElement('span');
        applyStyles(this.countEl, { color: LABEL_COLOR, whiteSpace: 'nowrap' });

        this.previousButton = createButton('‹', 'Предыдущий креатив');
        this.nextButton = createButton('›', 'Следующий креатив');
        this.collapseButton = createButton('−', 'Свернуть debug-панель');

        applyStyles(this.previousButton, { width: '26px', padding: '0' });
        applyStyles(this.nextButton, { width: '26px', padding: '0' });
        applyStyles(this.collapseButton, { width: '26px', padding: '0' });

        headerEl.append(
            titleEl,
            this.countEl,
            this.previousButton,
            this.nextButton,
            this.collapseButton,
        );

        this.toolbarEl = document.createElement('div');
        applyStyles(this.toolbarEl, { display: 'flex', gap: '6px', marginTop: '8px' });

        this.selectorButton = createButton('', 'Выбрать креатив');
        this.selectorButton.setAttribute('aria-haspopup', 'listbox');
        this.selectorButton.setAttribute('aria-expanded', 'false');
        applyStyles(this.selectorButton, {
            flex: '1',
            minWidth: '0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'left',
        });

        this.locateButton = createButton('Locate', 'Показать выбранный креатив на странице');
        this.toolbarEl.append(this.selectorButton, this.locateButton);

        this.metricsEl = document.createElement('div');
        applyStyles(this.metricsEl, {
            marginTop: '8px',
            maxHeight: 'calc(100vh - 190px)',
            overflowY: 'auto',
        });

        this.footerEl = document.createElement('div');
        applyStyles(this.footerEl, {
            color: LABEL_COLOR,
            marginTop: '6px',
            borderTop: `1px solid ${BORDER_COLOR}`,
            paddingTop: '4px',
            fontSize: '10px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
        });

        this.selectorEl = document.createElement('div');
        this.selectorEl.id = 'cpmind-debug-selector';
        this.selectorEl.setAttribute('role', 'dialog');
        this.selectorEl.setAttribute('aria-label', 'Выбор креатива');
        applyStyles(this.selectorEl, {
            display: 'none',
            position: 'absolute',
            left: '0',
            right: '0',
            top: '44px',
            zIndex: '2',
            margin: '0 10px',
            padding: '8px',
            backgroundColor: PANEL_BACKGROUND,
            border: `1px solid ${BORDER_COLOR}`,
            borderRadius: '7px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
        });

        this.selectorButton.setAttribute('aria-controls', this.selectorEl.id);

        this.searchInput = document.createElement('input');
        this.searchInput.type = 'search';
        this.searchInput.placeholder = 'Search creative...';
        this.searchInput.setAttribute('aria-label', 'Поиск креатива');
        applyStyles(this.searchInput, {
            display: 'block',
            width: '100%',
            height: '28px',
            boxSizing: 'border-box',
            padding: '0 8px',
            marginBottom: '6px',
            border: '1px solid #334155',
            borderRadius: '5px',
            outline: 'none',
            backgroundColor: '#0b0f17',
            color: '#f1f5f9',
            font: 'inherit',
            userSelect: 'text',
        });

        this.selectorListEl = document.createElement('div');
        this.selectorListEl.setAttribute('role', 'listbox');
        applyStyles(this.selectorListEl, { maxHeight: '240px', overflowY: 'auto' });

        this.selectorEl.append(this.searchInput, this.selectorListEl);

        this.highlightEl = document.createElement('div');
        applyStyles(this.highlightEl, {
            display: 'none',
            position: 'fixed',
            zIndex: '2147483646',
            boxSizing: 'border-box',
            border: `2px solid ${VALUE_COLOR}`,
            borderRadius: '4px',
            boxShadow: '0 0 0 2px rgba(50,211,69,0.18)',
            pointerEvents: 'none',
        });

        this.highlightLabelEl = document.createElement('div');
        applyStyles(this.highlightLabelEl, {
            position: 'absolute',
            left: '-2px',
            top: '-22px',
            height: '20px',
            padding: '0 6px',
            borderRadius: '4px 4px 0 0',
            backgroundColor: VALUE_COLOR,
            color: '#07110a',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontSize: '10px',
            fontWeight: 'bold',
            lineHeight: '20px',
            whiteSpace: 'nowrap',
        });

        this.highlightEl.appendChild(this.highlightLabelEl);
        this.el.append(headerEl, this.toolbarEl, this.metricsEl, this.footerEl, this.selectorEl);
        document.body.append(this.highlightEl, this.el);

        this.previousButton.addEventListener('click', this.handlePrevious);
        this.nextButton.addEventListener('click', this.handleNext);
        this.collapseButton.addEventListener('click', this.handleCollapse);
        this.selectorButton.addEventListener('click', this.handleSelectorToggle);
        this.locateButton.addEventListener('click', this.handleLocate);
        this.searchInput.addEventListener('input', this.handleSearch);
        this.el.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
        window.addEventListener('scroll', this.handleViewportChange, { passive: true });
        window.addEventListener('resize', this.handleViewportChange, { passive: true });
        window.addEventListener('pagehide', this.handlePageHide, { once: true });

        this.intervalId = setInterval(() => this.render(), 250);
    }

    register(creativeEl: HTMLElement, session: Session): number {
        const id = nextEntryId++;
        this.entries.push({ id, creativeEl, session });

        if (this.entries.length === 1) {
            this.activeIndex = 0;
        }

        this.renderSelectorList();
        this.render();

        console.log('%c[CPMind Debug] Creative registered', 'color: #4ade80; font-weight: bold;');
        console.log('[CPMind Debug] Creative element:', creativeEl);
        console.log('[CPMind Debug] Session ID:', session.impressionId);

        return id;
    }

    unregister(id: number): boolean {
        const index = this.entries.findIndex((entry) => entry.id === id);

        if (index === -1) {
            return this.entries.length === 0;
        }

        this.entries.splice(index, 1);

        if (this.entries.length === 0) {
            this.activeIndex = 0;
            this.highlightEl.style.display = 'none';
            return true;
        }

        if (index < this.activeIndex) {
            this.activeIndex--;
        } else if (this.activeIndex >= this.entries.length) {
            this.activeIndex = this.entries.length - 1;
        }

        this.renderSelectorList();
        this.render();

        return false;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;

        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.previousButton.removeEventListener('click', this.handlePrevious);
        this.nextButton.removeEventListener('click', this.handleNext);
        this.collapseButton.removeEventListener('click', this.handleCollapse);
        this.selectorButton.removeEventListener('click', this.handleSelectorToggle);
        this.locateButton.removeEventListener('click', this.handleLocate);
        this.searchInput.removeEventListener('input', this.handleSearch);
        this.el.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
        window.removeEventListener('scroll', this.handleViewportChange);
        window.removeEventListener('resize', this.handleViewportChange);
        window.removeEventListener('pagehide', this.handlePageHide);

        this.el.remove();
        this.highlightEl.remove();
        this.entries.length = 0;
    }

    private getActiveEntry(): DebugEntry | null {
        return this.entries[this.activeIndex] ?? null;
    }

    private getEntryLabel(entry: DebugEntry, index: number): string {
        const creativeId = entry.creativeEl.getAttribute('data-creative-id')?.trim();
        if (creativeId) return creativeId;
        return `creative ${index + 1}`;
    }

    private setActiveIndex(index: number): void {
        if (this.entries.length === 0) return;
        const normalizedIndex = (
            (index % this.entries.length) + this.entries.length
        ) % this.entries.length;
        this.activeIndex = normalizedIndex;
        this.renderSelectorList();
        this.render();
    }

    private setButtonEnabled(button: HTMLButtonElement, enabled: boolean): void {
        button.disabled = !enabled;
        button.style.opacity = enabled ? '1' : '0.45';
        button.style.cursor = enabled ? 'pointer' : 'default';
    }

    private getCurrentTimeInView(session: Session): number {
        let timeInView = session.timeInViewSec;
        if (session.viewStart !== null) {
            timeInView += (Date.now() - session.viewStart) / 1000;
        }
        return timeInView;
    }

    private getTabActivePct(session: Session): string {
        const now = Date.now();
        const impressionStart = session.timestampStart || now;
        const total = now - impressionStart;
        if (total === 0) return '100%';
        const active = computeActiveTimeMsInRange(
            session.visibilityStateHistory,
            impressionStart,
            now,
        );
        return ((active / total) * 100).toFixed(1) + '%';
    }

    private getShareOfScreenAvg(session: Session): string {
        const samples = session.shareOfScreenSamples;
        if (samples.length === 0) return '0%';
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        return avg.toFixed(1) + '%';
    }

    private row(label: string, value: string, warn = false): string {
        const valueColor = warn ? WARN_COLOR : VALUE_COLOR;
        return (
            `<div>` +
            `<span style="color:${LABEL_COLOR}">${escapeHtml(label)}: </span>` +
            `<span style="color:${valueColor}">${escapeHtml(value)}</span>` +
            `</div>`
        );
    }

    private render(): void {
        if (this.disposed) return;
        const entry = this.getActiveEntry();
        if (entry === null) return;
        this.renderChrome(entry);
        if (this.expanded) this.renderMetrics(entry.session);
        if (this.selectorOpen) this.renderSelectorList();
        this.updateHighlight();
    }

    private renderChrome(entry: DebugEntry): void {
        const total = this.entries.length;
        const current = this.activeIndex + 1;
        const label = this.getEntryLabel(entry, this.activeIndex);

        this.countEl.textContent = `${current}/${total}`;
        this.selectorButton.textContent = `${label} ▾`;
        this.selectorButton.title = label;

        this.footerEl.textContent =
            `id: ${entry.session.impressionId.slice(0, 8)}... · ` +
            `${entry.session.deviceType} · ${entry.session.publisherDomain}`;

        const canNavigate = total > 1;
        this.setButtonEnabled(this.previousButton, canNavigate);
        this.setButtonEnabled(this.nextButton, canNavigate);
        this.setButtonEnabled(this.selectorButton, canNavigate);

        this.toolbarEl.style.display = this.expanded ? 'flex' : 'none';
        this.metricsEl.style.display = this.expanded ? 'block' : 'none';
        this.footerEl.style.display = this.expanded ? 'block' : 'none';

        this.collapseButton.textContent = this.expanded ? '−' : '+';
        this.collapseButton.setAttribute(
            'aria-label',
            this.expanded ? 'Свернуть debug-панель' : 'Развернуть debug-панель',
        );
    }

    private renderMetrics(session: Session): void {
        const inView = session.viewStart !== null;
        const timeInView = this.getCurrentTimeInView(session);

        const viewportStatus = inView
            ? `<span style="color:${VALUE_COLOR}">✓ viewport ≥75%</span>`
            : `<span style="color:${WARN_COLOR}">✗ viewport &lt;75%</span>`;

        let s5Event = 'none';
        if (session.clicked) {
            s5Event = 'clicked';
        } else if (session.zoom) {
            s5Event = 'zoom';
        } else if (session.swipeCount > 0) {
            s5Event = `swipe×${session.swipeCount}`;
        } else if (session.tapCount > 0) {
            s5Event = `tap×${session.tapCount}`;
        } else if (session.hoverDurationMaxMs > 0) {
            s5Event = `hover ${session.hoverDurationMaxMs}ms`;
        } else if (session.hoverCount > 0) {
            s5Event = `hover×${session.hoverCount}`;
        }

        const scrollSpeed = session.s3 === null
            ? 'n/a (iframe)'
            : `${(session.s3.scroll_speed_avg_px_s ?? 0).toFixed(0)} px/s`;

        // S6 — отображается для video_creative независимо от delivery mode
        // Player (instream/outstream) обновляет те же поля через accumulator methods
        const s6Rows = session.s6 !== null
            ? this.row(
                'S6 play',
                session.s6.play_initiated ? 'true' : 'false',
                !session.s6.play_initiated,
            ) +
            this.row(
                'S6 completion',
                session.s6.completion_rate_pct.toFixed(1) + '%',
                session.s6.completion_rate_pct < 25,
            ) +
            this.row(
                'S6 muted',
                session.s6.muted_status,
                session.s6.play_initiated && !session.s6.everUnmutedWhilePlaying,
            ) +
            this.row(
                'S6 audible_sec',
                session.s6.audible_time_sec.toFixed(1) + 's',
            ) +
            this.row(
                'S6 replays',
                String(session.s6.replay_count),
            ) +
            this.row(
                'S6 skipped',
                String(session.s6.skipped),
                session.s6.skipped,
            ) +
            this.row(
                'S6 audio',
                session.s6.audio_connection,
            )
            : '';

        this.metricsEl.innerHTML =
            `<div style="margin-bottom:6px">${viewportStatus}</div>` +
            `<div style="color:${VALUE_COLOR};font-size:13px;font-weight:bold;margin-bottom:6px">` +
            `${timeInView.toFixed(1)}s в зоне видимости</div>` +
            this.row('S1 time_in_view', timeInView.toFixed(2) + 's') +
            this.row('S1 mrc_compliant', String(session.mrcCompliant), !session.mrcCompliant) +
            this.row('S1 max_continuous', session.maxContinuousViewSec.toFixed(2) + 's') +
            this.row('S1 visible_pct', session.visiblePixelsPct + '%') +
            this.row('S2 share_avg', this.getShareOfScreenAvg(session)) +
            this.row('S2 share_max', session.shareOfScreenMax.toFixed(1) + '%') +
            this.row('S3 scroll_speed', scrollSpeed, session.s3 === null) +
            this.row(
                'S3 pauses',
                session.s3 !== null ? String(session.s3.pause_count ?? 0) : 'n/a',
            ) +
            this.row(
                'S3 dir_changes',
                session.s3 !== null ? String(session.s3.direction_changes ?? 0) : 'n/a',
            ) +
            this.row('S4 tab_active', this.getTabActivePct(session), session.tabSwitchesCount > 0) +
            this.row('S4 switches', String(session.tabSwitchesCount)) +
            this.row('S5 top_event', s5Event, s5Event === 'none') +
            s6Rows +
            this.row(
                'Presence events',
                String(session.eventsDuringImpression),
                session.eventsDuringImpression === 0,
            ) +
            this.row(
                'FP hash',
                session.fpHash !== null ? session.fpHash.slice(0, 8) + '...' : 'null',
                session.fpHash === null,
            ) +
            this.row('Intervals n', String(session.eventIntervals.length));
    }

    private renderSelectorList(): void {
        const query = this.searchInput.value.trim().toLowerCase();
        this.selectorListEl.replaceChildren();
        let visibleCount = 0;

        this.entries.forEach((entry, index) => {
            const label = this.getEntryLabel(entry, index);
            const searchable = [
                label,
                entry.session.impressionId,
                entry.session.publisherDomain,
                String(index + 1),
            ].join(' ').toLowerCase();

            if (query && !searchable.includes(query)) return;

            visibleCount++;
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('role', 'option');
            button.setAttribute('aria-selected', String(index === this.activeIndex));

            applyStyles(button, {
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                width: '100%',
                minHeight: '30px',
                padding: '4px 6px',
                border: '0',
                borderRadius: '4px',
                backgroundColor: index === this.activeIndex ? '#172033' : 'transparent',
                color: '#cbd5e1',
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
            });

            const statusEl = document.createElement('span');
            statusEl.textContent = '●';
            statusEl.setAttribute(
                'aria-label',
                entry.session.viewStart !== null ? 'В viewport' : 'Вне viewport',
            );
            applyStyles(statusEl, {
                color: entry.session.viewStart !== null ? VALUE_COLOR : MUTED_COLOR,
                flex: '0 0 auto',
            });

            const indexEl = document.createElement('span');
            indexEl.textContent = String(index + 1);
            applyStyles(indexEl, { color: LABEL_COLOR, width: '24px', flex: '0 0 24px', textAlign: 'right' });

            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            applyStyles(labelEl, {
                flex: '1',
                minWidth: '0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: index === this.activeIndex ? HEADER_COLOR : '#cbd5e1',
                fontWeight: index === this.activeIndex ? 'bold' : 'normal',
            });

            button.append(statusEl, indexEl, labelEl);

            button.addEventListener('click', () => {
                this.setActiveIndex(index);
                this.closeSelector();
                this.el.focus({ preventScroll: true });
            });

            this.selectorListEl.appendChild(button);
        });

        if (visibleCount === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.textContent = 'No creatives found';
            applyStyles(emptyEl, { color: LABEL_COLOR, padding: '8px 6px', textAlign: 'center' });
            this.selectorListEl.appendChild(emptyEl);
        }
    }

    private openSelector(): void {
        if (this.entries.length <= 1) return;
        this.selectorOpen = true;
        this.searchInput.value = '';
        this.selectorEl.style.display = 'block';
        this.selectorButton.setAttribute('aria-expanded', 'true');
        this.renderSelectorList();
        this.searchInput.focus({ preventScroll: true });
    }

    private closeSelector(): void {
        if (!this.selectorOpen) return;
        this.selectorOpen = false;
        this.selectorEl.style.display = 'none';
        this.selectorButton.setAttribute('aria-expanded', 'false');
    }

    private updateHighlight(): void {
        const entry = this.getActiveEntry();
        if (entry === null || !entry.creativeEl.isConnected) {
            this.highlightEl.style.display = 'none';
            return;
        }

        const rect = entry.creativeEl.getBoundingClientRect();
        const visible =
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < window.innerHeight &&
            rect.left < window.innerWidth;

        if (!visible) {
            this.highlightEl.style.display = 'none';
            return;
        }

        const label = this.getEntryLabel(entry, this.activeIndex);
        this.highlightLabelEl.textContent = `CPMind · ${this.activeIndex + 1} · ${label}`;
        this.highlightEl.style.display = 'block';
        this.highlightEl.style.left = `${rect.left}px`;
        this.highlightEl.style.top = `${rect.top}px`;
        this.highlightEl.style.width = `${rect.width}px`;
        this.highlightEl.style.height = `${rect.height}px`;
    }

    private readonly handlePrevious = (): void => { this.setActiveIndex(this.activeIndex - 1); };
    private readonly handleNext = (): void => { this.setActiveIndex(this.activeIndex + 1); };

    private readonly handleCollapse = (): void => {
        this.expanded = !this.expanded;
        if (!this.expanded) this.closeSelector();
        this.render();
    };

    private readonly handleSelectorToggle = (): void => {
        if (this.selectorOpen) {
            this.closeSelector();
        } else {
            this.openSelector();
        }
    };

    private readonly handleLocate = (): void => {
        const entry = this.getActiveEntry();
        if (entry === null || !entry.creativeEl.isConnected) return;
        entry.creativeEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    };

    private readonly handleSearch = (): void => { this.renderSelectorList(); };

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            this.closeSelector();
            this.el.focus({ preventScroll: true });
            return;
        }
        if (event.target instanceof HTMLInputElement) return;
        if (event.key === 'ArrowLeft' && this.entries.length > 1) {
            event.preventDefault();
            this.handlePrevious();
        } else if (event.key === 'ArrowRight' && this.entries.length > 1) {
            event.preventDefault();
            this.handleNext();
        }
    };

    private readonly handleDocumentPointerDown = (event: PointerEvent): void => {
        if (!this.selectorOpen) return;
        const target = event.target;
        if (target instanceof Node && !this.el.contains(target)) {
            this.closeSelector();
        }
    };

    private readonly handleViewportChange = (): void => { this.updateHighlight(); };

    private readonly handlePageHide = (): void => {
        this.dispose();
        if (overlayManager === this) overlayManager = null;
    };
}

function getOverlayManager(): DebugOverlayManager {
    if (overlayManager === null) {
        overlayManager = new DebugOverlayManager();
    }
    return overlayManager;
}

export class DebugOverlay {
    private readonly manager: DebugOverlayManager;
    private readonly entryId: number;
    private destroyed = false;

    constructor(creativeEl: HTMLElement, session: Session) {
        this.manager = getOverlayManager();
        this.entryId = this.manager.register(creativeEl, session);
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        const empty = this.manager.unregister(this.entryId);
        if (empty && overlayManager === this.manager) {
            this.manager.dispose();
            overlayManager = null;
        }
    }
}