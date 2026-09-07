export interface S4Row {
  tabActiveTimeMs: number;
  tabTotalTimeMs: number;
  tabSwitchesCount: number;
}

export interface S4FitResult {
  lambda: number;
  tRefMs: number;
  iterations: number;
  converged: boolean;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx] ?? 0;
}

/**
 * Newton-Raphson по λ: подбираем λ так, чтобы exp(-λ·n90) ≈ targetPenaltyAtP90.
 * Целевая точка: P90 по tabSwitchesCount даёт штраф ≈ 0.45 (§8.1).
 * При n90=0 (сегмент без переключений) возвращает минимальный λ=0.01.
 */
export function fitLambda(
  switchCounts: number[],
  targetPenaltyAtP90 = 0.45,
): { lambda: number; iterations: number; converged: boolean } {
  const sorted = [...switchCounts].sort((a, b) => a - b);
  const n90 = percentile(sorted, 90);

  if (n90 === 0) {
    return { lambda: 0.01, iterations: 0, converged: true };
  }

  let lambda = 0.08;
  let iterations = 0;
  const maxIter = 50;
  const tol = 1e-6;

  while (iterations < maxIter) {
    const fVal = Math.exp(-lambda * n90) - targetPenaltyAtP90;
    if (Math.abs(fVal) < tol) break;

    const fPrime = -n90 * Math.exp(-lambda * n90);
    if (Math.abs(fPrime) < 1e-12) break;

    const lambdaNext = lambda - fVal / fPrime;
    if (lambdaNext < 0) {
      lambda = lambda / 2;
      iterations++;
      continue;
    }

    if (Math.abs(lambdaNext - lambda) < tol) {
      lambda = lambdaNext;
      break;
    }

    lambda = lambdaNext;
    iterations++;
  }

  return {
    lambda: Math.max(0.01, lambda),
    iterations,
    converged: iterations < maxIter,
  };
}

/**
 * T_ref = медиана tabActiveTimeMs по показам без переключений (tabSwitchesCount=0).
 * Сессии без фрагментации задают эталон «полноценного» контакта (§8.1).
 * При нехватке данных (< 30 наблюдений) возвращает дефолт 5000 мс.
 */
export function fitTRef(rows: S4Row[]): number {
  const zeroSwitchSessions = rows
    .filter((r) => r.tabSwitchesCount === 0 && r.tabActiveTimeMs > 0)
    .map((r) => r.tabActiveTimeMs);

  if (zeroSwitchSessions.length < 30) return 5000;

  const sorted = [...zeroSwitchSessions].sort((a, b) => a - b);
  return Math.round(percentile(sorted, 50));
}

/**
 * Полный фит параметров S4: λ через Newton-Raphson, T_ref через медиану.
 */
export function fitS4Params(rows: S4Row[]): S4FitResult {
  const switchCounts = rows.map((r) => r.tabSwitchesCount);
  const { lambda, iterations, converged } = fitLambda(switchCounts);
  const tRefMs = fitTRef(rows);
  return { lambda, tRefMs, iterations, converged };
}