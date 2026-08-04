'use client';

import { useState } from 'react';
import katex from 'katex';
import type { SignalTab } from '@/lib/admin/signal-formulas';
import { SIGNAL_FORMULAS } from '@/lib/admin/signal-formulas';
import styles from '@/styles/formula-card.module.css';

function renderKatex(
    latex: string,
    display: boolean,
): string {
    return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: display,
        output: 'html',
    });
}

interface Props {
    signal: SignalTab;
}

export function FormulaCard({ signal }: Props) {
    const [expanded, setExpanded] = useState(true);
    const def = SIGNAL_FORMULAS[signal];

    return (
        <div className={styles.card}>
            <button
                type="button"
                className={styles.header}
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
            >
                <div className={styles.headerLeft}>
                    <span className={styles.title}>{def.signal}</span>
                    <span className={styles.weight}>{def.weight}</span>
                </div>
                <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}>
                    ▾
                </span>
            </button>

            {expanded && (
                <div className={styles.body}>
                    <div className={styles.section}>
                        <div className={styles.formulas}>
                            {def.formulas.map((f, i) => (
                                <div key={i} className={styles.formulaBlock}>
                                    {f.label !== undefined && (
                                        <span className={styles.formulaLabel}>{f.label}</span>
                                    )}
                                    <div
                                        className={styles.formula}
                                        dangerouslySetInnerHTML={{ __html: renderKatex(f.latex, true) }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.section}>
                        <div className={styles.sectionLabel}>Переменные</div>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th className={styles.th}>Символ</th>
                                        <th className={styles.th}>Описание</th>
                                        <th className={styles.th}>Источник</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {def.variables.map((v, i) => (
                                        <tr key={i} className={styles.tr}>
                                            <td
                                                className={`${styles.td} ${styles.tdSymbol}`}
                                                dangerouslySetInnerHTML={{ __html: renderKatex(v.symbol, false) }}
                                            />
                                            <td className={styles.td}>{v.description}</td>
                                            <td className={`${styles.td} ${styles.tdSource}`}>{v.source}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className={styles.section}>
                        <div className={styles.sectionLabel}>Логика</div>
                        <p className={styles.note}>{def.note}</p>
                    </div>
                </div>
            )}
        </div>
    );
}