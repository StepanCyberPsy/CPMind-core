export type SignalTab =
    | 's1'
    | 's2'
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
        note: 'Weibull CDF моделирует накопленную вероятность того, что показ достиг порога качества. При k < 1 риск ухода убывает со временем; при k > 1 — возрастает. Fallback: k=1.0, λ=5.0. Цепочка выбора модели: device × creative_group → creative_group → global. Обучаются оба уровня: пока точный сегмент не набрал выборку, применяется модель группы.',
    },
    s2: {
        signal: 'S2 — Share of Screen',
        weight: '0.20 (banner) / 0.10 (video)',
        formulas: [
            {
                latex: '\\hat{F}(x) = p_i + \\frac{x - q_i}{q_{i+1} - q_i}\\,(p_{i+1} - p_i),\\qquad q_i \\leq x < q_{i+1}',
                label: 'эмпирическая функция распределения',
            },
            {
                latex: 'S_2 = \\mathrm{clamp}\\!\\left(100 \\times \\hat{F}(r_{\\text{avg}}),\\;0,\\;100\\right)',
                label: 'итоговый скор',
            },
        ],
        variables: [
            {
                symbol: 'r_{\\text{avg}}',
                description: 'share_of_screen_avg_pct — средняя доля экрана, взвешенная длительностью интервалов между отсчётами',
                source: 'payload',
            },
            {
                symbol: 'q_i',
                description: 'опорные значения доли экрана, 11 точек от p01 до p99',
                source: 's2_configs',
            },
            {
                symbol: 'p_i',
                description: 'уровни квантилей, соответствующие опорным значениям',
                source: 's2_configs',
            },
        ],
        note: 'Показ оценивается относительно типичной экспозиции своего сегмента, а не по абсолютной величине: доля, высокая для одного формата, может быть рядовой для другого. Между опорными точками — линейная интерполяция, за крайними — продление к границам диапазона. Fallback воспроизводит формулу, действовавшую до введения модели (√r × 10), поэтому исторические значения остаются сопоставимыми. Цепочка: device × creative_group → creative_group → global. Отсчёты взвешиваются фактической длительностью интервала: простое среднее перекашивается, когда браузер задерживает таймер.',
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
        note: 'S3 = null при cross-domain iframe — вес перераспределяется пропорционально между остальными сигналами. Прокси-метка обучения: y=1 если time_in_view > медианы по сегменту или был клик. Цепочка выбора модели: device × creative_group → creative_group → global, на каждом уровне приоритетна модель версии констант показа. Обучаются оба уровня сегментации.',
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
        weight: '0.40 (video_instream / video_outstream) / 0.00 (banner)',
        formulas: [
            {
                latex: 'z_c = \\frac{r_c-\\mu_c}{\\sigma_c},\\quad z_q = \\frac{q-\\mu_q}{\\sigma_q},\\quad z_a = \\frac{r_a-\\mu_a}{\\sigma_a},\\quad z_r = \\frac{\\ln(n_r+1)-\\mu_r}{\\sigma_r}',
                label: 'z-score нормализация',
            },
            {
                latex: 'z_{\\text{in}} = \\beta_0 + \\beta_1 z_c + \\beta_2 z_q + \\beta_3 z_a + \\beta_4 m + \\beta_5 u + \\beta_6 z_r + \\beta_7 s + \\beta_8(z_c\\cdot z_a)',
                label: 'in-stream',
            },
            {
                latex: 'z_{\\text{out}} = \\gamma_0 + \\gamma_1 z_c + \\gamma_2 z_q + \\gamma_3 z_a + \\gamma_4 m + \\gamma_5 u + \\gamma_6 z_r + \\gamma_7 k + \\gamma_8(z_c\\cdot z_a)',
                label: 'out-stream',
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
                symbol: 'q',
                description: 'quartileOrdinal ∈ {0, 10, 25, 50, 75, 100} — достигнутый рубеж просмотра',
                source: 'payload',
            },
            {
                symbol: 'r_a',
                description: 'audibleRatio = clamp(audible_time_sec / duration_sec, 0, 1)',
                source: 'payload',
            },
            {
                symbol: 'n_r',
                description: 'replay_count — количество повторных просмотров',
                source: 'payload',
            },
            {
                symbol: 'm,\\, u',
                description: 'muted_throughout / unmuted_by_user (0/1)',
                source: 'payload',
            },
            {
                symbol: 's',
                description: 'skipped (0/1) — отказ зрителя в in-stream',
                source: 'payload',
            },
            {
                symbol: 'k',
                description: 'closed_by_user (0/1) — отказ зрителя в out-stream',
                source: 'payload',
            },
            {
                symbol: 'z_c\\cdot z_a',
                description: 'терм взаимодействия: completion × audibility',
                source: 'вычисляется',
            },
            {
                symbol: '\\boldsymbol{\\beta},\\,\\boldsymbol{\\gamma}',
                description: 'векторы из 9 коэффициентов, независимые для каждого режима',
                source: 's6_logistic_configs',
            },
            {
                symbol: '\\boldsymbol{\\mu},\\,\\boldsymbol{\\sigma}',
                description: 'средние и СКО для z-score нормализации признаков',
                source: 's6_logistic_configs',
            },
        ],
        note: 'S6 = null для баннерных креативов — вес перераспределяется. Две независимые модели: реклама in-stream стартует со звуком внутри контента, который зритель смотрит намеренно, и m означает заглушение зрителем; out-stream стартует без звука в потоке страницы, и m означает бездействие, а u — явный интерес. Отказ выражается пропуском у in-stream и закрытием поверхности у out-stream. Сегменты: instream|{device}|{skippable} — 6, outstream_sticky|{device} и outstream_inpage|{device} — по 3; закреплённое окно не покидает область просмотра, встроенное уходит из неё и встаёт на паузу. Цепочка: группа → {mode}|{device} → {mode}|global → сегмент прежней схемы для показов тега. Метка обучения строится на присутствии зрителя (активная вкладка, фокус окна, остановка прокрутки либо нахождение во вьюпорте) и не пересекается с признаками модели; пороги подбираются перебором и сохраняются в конфигурации вместе с коэффициентами.',
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