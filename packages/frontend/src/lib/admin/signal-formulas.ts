export type SignalTab =
    | 's1'
    | 's3'
    | 's4'
    | 's5'
    | 's6'
    | 's7';

export interface VariableRow {
    symbol: string;
    description: string;
    source: string;
}

export interface FormulaBlock {
    latex: string;
    label?: string;
}

export interface FormulaDefinition {
    signal: string;
    weight: string;
    formulas: FormulaBlock[];
    variables: VariableRow[];
    note: string;
}

export const SIGNAL_FORMULAS: Record<SignalTab, FormulaDefinition> = {
    s1: {
        signal: 'S1 — Time-in-View',
        weight: '0.30 (banner) / 0.15 (video)',
        formulas: [
            {
                latex: 'S_1 = \\min\\!\\left(100,\\;\\Bigl(1 - e^{-(t/\\lambda)^k}\\Bigr)\\times 100\\right)',
            },
        ],
        variables: [
            {
                symbol: 't',
                description: 'время видимости ≥75% пикселей непрерывно, сек',
                source: 'payload',
            },
            {
                symbol: 'k',
                description: 'параметр формы распределения Weibull',
                source: 's1_weibull_configs',
            },
            {
                symbol: '\\lambda',
                description: 'параметр масштаба распределения Weibull',
                source: 's1_weibull_configs',
            },
        ],
        note: 'Weibull CDF моделирует накопленную вероятность того, что показ достиг порога качества. При k < 1 риск ухода убывает со временем; при k > 1 — возрастает. Fallback: k=1.0, λ=5.0. 9 сегментов: device × creative_group.',
    },
    s3: {
        signal: 'S3 — Scroll Velocity',
        weight: '0.15 (banner) / 0.10 (video)',
        formulas: [
            {
                latex: '\\mathbf{x} = \\bigl[1,\\;v_{\\text{avg}},\\;v_{\\text{max}},\\;n_p,\\;n_r,\\;n_s,\\;f_{\\text{read}},\\;\\sigma_v\\bigr]',
                label: 'вектор признаков',
            },
            {
                latex: 'S_3 = \\min\\!\\left(100,\\;\\sigma\\!\\left(\\boldsymbol{\\beta}\\cdot\\frac{\\mathbf{x}-\\boldsymbol{\\mu}}{\\mathbf{s}}\\right)\\times 100\\right),\\quad \\sigma(z)=\\frac{1}{1+e^{-z}}',
                label: 'нормализованный скор',
            },
        ],
        variables: [
            {
                symbol: 'v_{\\text{avg}},\\, v_{\\text{max}}',
                description: 'средняя и максимальная скорость скролла, пкс/с',
                source: 'payload',
            },
            {
                symbol: 'n_p,\\, n_r,\\, n_s',
                description: 'количество пауз / возвратов / серий быстрого скролла',
                source: 'payload',
            },
            {
                symbol: 'f_{\\text{read}}',
                description: 'флаг паттерна чтения (0/1)',
                source: 'payload',
            },
            {
                symbol: '\\sigma_v',
                description: 'стандартное отклонение скорости скролла',
                source: 'payload',
            },
            {
                symbol: '\\boldsymbol{\\beta}',
                description: 'вектор из 8 коэффициентов логистической регрессии',
                source: 's3_logistic_configs',
            },
            {
                symbol: '\\boldsymbol{\\mu},\\, \\mathbf{s}',
                description: 'средние и СКО признаков для z-score нормализации',
                source: 's3_logistic_configs',
            },
        ],
        note: 'S3 = null при cross-domain iframe — вес перераспределяется пропорционально между остальными сигналами. Прокси-метка обучения: y=1 если time_in_view > медианы по сегменту или был клик. 9 сегментов: device × creative_group.',
    },
    s4: {
        signal: 'S4 — Tab Activity',
        weight: '0.15 (banner) / 0.10 (video)',
        formulas: [
            {
                latex: '\\rho = \\frac{t_{\\text{active}}}{t_{\\text{total}}},\\qquad \\bar{s} = \\frac{t_{\\text{active}}}{\\max(1,\\, n+1)}',
                label: 'вспомогательные величины',
            },
            {
                latex: 'S_4 = \\mathrm{clamp}\\!\\left(\\rho\\times 100\\times e^{-\\lambda n}\\times\\min\\!\\left(1,\\,\\frac{\\bar{s}}{T_{\\text{ref}}}\\right),\\;0,\\;100\\right)',
                label: 'итоговый скор',
            },
        ],
        variables: [
            {
                symbol: 't_{\\text{active}}',
                description: 'суммарное время активной вкладки, мс',
                source: 'payload',
            },
            {
                symbol: 't_{\\text{total}}',
                description: 'общее время показа, мс',
                source: 'payload',
            },
            {
                symbol: 'n',
                description: 'количество переключений вкладок',
                source: 'payload',
            },
            {
                symbol: '\\lambda',
                description: 'штрафной параметр за частоту переключений',
                source: 's4_configs',
            },
            {
                symbol: 'T_{\\text{ref}}',
                description: 'эталонная длина полноценной активной сессии, мс',
                source: 's4_configs',
            },
        ],
        note: 'Экспоненциальный штраф exp(−λn) снижает скор при частых переключениях. Множитель min(1, s̄/T_ref) штрафует короткие сессии относительно эталона. Fallback: λ=0.08, T_ref=5000 мс. 5 сегментов: desktop_banner, mobile_banner, desktop_video, mobile_video, default.',
    },
    s5: {
        signal: 'S5 — Interaction Events',
        weight: '0.15 (banner) / 0.10 (video)',
        formulas: [
            {
                latex: '\\mathbf{x}_{\\text{desk}} = \\bigl[1,\\;c,\\;h_d,\\;h_n,\\;p\\bigr]',
                label: 'desktop',
            },
            {
                latex: '\\mathbf{x}_{\\text{mob}} = \\bigl[1,\\;c,\\;z,\\;t_n,\\;s_n\\bigr]',
                label: 'mobile / tablet',
            },
            {
                latex: 'S_5 = \\min\\!\\left(100,\\;\\mathrm{round}\\bigl(\\sigma(\\boldsymbol{\\beta}\\cdot\\mathbf{x})\\times 100\\bigr)\\right)',
                label: 'итоговый скор',
            },
        ],
        variables: [
            {
                symbol: 'c',
                description: 'клик по баннеру (0/1)',
                source: 'payload',
            },
            {
                symbol: 'h_d',
                description: 'hoverDurationNorm = min(1, log(t_hover+1) / log(10001))',
                source: 'payload',
            },
            {
                symbol: 'h_n',
                description: 'hoverCountNorm = min(1, n_hover / 20)',
                source: 'payload',
            },
            {
                symbol: 'p',
                description: 'proximityNorm = min(1, 1 − dist / PROXIMITY_TRACK_ZONE_PX)',
                source: 'payload',
            },
            {
                symbol: 'z',
                description: 'zoom-жест (0/1, только mobile)',
                source: 'payload',
            },
            {
                symbol: 't_n',
                description: 'tapCountNorm = min(1, n_tap / 5)',
                source: 'payload',
            },
            {
                symbol: 's_n',
                description: 'swipeCountNorm = min(1, n_swipe / 3)',
                source: 'payload',
            },
            {
                symbol: '\\boldsymbol{\\beta}',
                description: 'вектор из 5 коэффициентов (раздельный для desktop / mobile_tablet)',
                source: 's5_logistic_configs',
            },
        ],
        note: 'Прокси-метка обучения: y=1 если clicked=true ИЛИ hover_duration_max_ms ≥ p75 по сегменту. Вектор признаков различается для desktop и mobile_tablet — разная поведенческая семантика. 2 сегмента.',
    },
    s6: {
        signal: 'S6 — Video Engagement + Audibility',
        weight: '0.40 (video) / 0.00 (banner)',
        formulas: [
            {
                latex: 'z_c = \\frac{r_c-\\mu_c}{\\sigma_c},\\quad z_a = \\frac{r_a-\\mu_a}{\\sigma_a},\\quad z_q = \\frac{q-\\mu_q}{\\sigma_q},\\quad z_r = \\frac{\\ln(n_r+1)-\\mu_r}{\\sigma_r}',
                label: 'z-score нормализация',
            },
            {
                latex: 'z = \\beta_0 + \\beta_1 z_c + \\beta_2 z_a + \\beta_3 z_q + \\beta_4 z_r + \\beta_5 p + \\beta_6 s + \\beta_7 u + \\beta_8(z_c\\cdot z_a)',
                label: 'линейная комбинация',
            },
            {
                latex: 'S_6 = \\min\\!\\left(100,\\;\\sigma(z)\\times 100\\right)',
                label: 'итоговый скор',
            },
        ],
        variables: [
            {
                symbol: 'r_c',
                description: 'completion_rate_pct — процент досмотра (0–100)',
                source: 'payload',
            },
            {
                symbol: 'r_a',
                description: 'audibleRatio = audible_time_sec / max(1, duration_sec)',
                source: 'payload',
            },
            {
                symbol: 'q',
                description: 'quartileOrdinal ∈ {0,1,2,3,4} (none / 25 / 50 / 75 / 100)',
                source: 'payload',
            },
            {
                symbol: 'n_r',
                description: 'replay_count — количество повторных просмотров',
                source: 'payload',
            },
            {
                symbol: 'p,\\, s,\\, u',
                description: 'play_initiated / skipped / unmuted_by_user (0/1)',
                source: 'payload',
            },
            {
                symbol: 'z_c\\cdot z_a',
                description: 'терм взаимодействия: completion × audibility',
                source: 'вычисляется',
            },
            {
                symbol: '\\boldsymbol{\\beta}',
                description: 'вектор из 9 коэффициентов',
                source: 's6_logistic_configs',
            },
            {
                symbol: '\\boldsymbol{\\mu},\\,\\boldsymbol{\\sigma}',
                description: 'средние и СКО для z-score нормализации признаков',
                source: 's6_logistic_configs',
            },
        ],
        note: 'S6 = null для баннерных креативов — вес перераспределяется. Терм взаимодействия z_c·z_a усиливает сигнал при одновременно высоком досмотре и аудируемости. Прокси-метка: y=1 если completion=true И (unmuted_by_user ИЛИ NOT muted_throughout). 6 сегментов: device × skippable/non_skippable.',
    },
    s7: {
        signal: 'S7 — Page Context',
        weight: '0.05 (banner и video)',
        formulas: [
            {
                latex: '\\text{pos} = \\begin{cases} 55 & \\text{ATF и }y_r < y_{\\text{low}} \\\\ 45 & \\text{ATF и }y_r \\geq y_{\\text{low}} \\\\ 30 & \\text{BTF и }y_r < y_{\\text{mid}} \\\\ 15 & \\text{иначе} \\end{cases}',
                label: 'позиционный скор',
            },
            {
                latex: '\\Delta_c = \\begin{cases} 0 & n_b \\leq c_{\\text{mid}} \\\\ -12 & n_b \\leq c_{\\text{high}} \\\\ -25 & \\text{иначе} \\end{cases} \\qquad \\Delta_p = \\begin{cases} +5 & p_v > 80 \\\\ -5 & p_v < 20 \\\\ 0 & \\text{иначе} \\end{cases}',
                label: 'штраф за clutter и бонус за persistence',
            },
            {
                latex: 'S_7 = \\mathrm{clamp}(\\text{pos} + \\Delta_c + \\Delta_p,\\;0,\\;100)',
                label: 'итоговый скор',
            },
        ],
        variables: [
            {
                symbol: 'y_r',
                description: 'relativeY = вертикальная позиция / высота страницы',
                source: 'payload',
            },
            {
                symbol: '\\text{ATF}',
                description: 'is_above_the_fold — баннер был выше линии сгиба при загрузке',
                source: 'payload',
            },
            {
                symbol: 'n_b',
                description: 'banners_in_viewport — конкурирующие баннеры в видимой области',
                source: 'payload',
            },
            {
                symbol: 'p_v',
                description: 'viewability_persistence_pct — доля времени видимости за показ, %',
                source: 'payload',
            },
            {
                symbol: 'y_{\\text{low}},\\, y_{\\text{mid}}',
                description: 'p33 ATF и p67 BTF по relativeY в сегменте',
                source: 's7_quantile_configs',
            },
            {
                symbol: 'c_{\\text{mid}},\\, c_{\\text{high}}',
                description: 'p50 и p80 конкурирующих баннеров в сегменте',
                source: 's7_quantile_configs',
            },
        ],
        note: 'Квантильная калибровка вместо ML — вес 0.05 не оправдывает инфраструктуру градиентного спуска. Пороги пересчитываются ежемесячно из реального трафика. 3 сегмента: desktop, mobile, tablet.',
    },
};