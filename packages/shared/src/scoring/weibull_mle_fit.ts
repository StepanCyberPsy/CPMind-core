import type { WeibullParams } from './signal_defaults.js';
export type { WeibullParams };

export interface WeibullFitResult {
  k: number;
  lambda: number;
  logLikelihood: number;
  sampleSize: number;
  converged: boolean;
}

/** Уравнение g(k) = 0 для MLE Weibull (Liu et al. 2010, формула 6) */
function g(
  k: number,
  times: number[],
  n: number,
  sumLnT: number,
): number {
  let sumTPowK = 0;
  let sumTPowKLnT = 0;
  for (const t of times) {
    const tK = Math.pow(t, k);
    sumTPowK += tK;
    sumTPowKLnT += tK * Math.log(t);
  }
  return sumTPowK + (k * sumTPowK * sumLnT) / n - k * sumTPowKLnT;
}

/** Производная g'(k) для шага Ньютона-Рафсона */
function gDerivative(
  k: number,
  times: number[],
  n: number,
  sumLnT: number,
): number {
  let sumTPowK = 0;
  let sumTPowKLnT = 0;
  let sumTPowKLn2T = 0;
  for (const t of times) {
    const tK = Math.pow(t, k);
    const lnT = Math.log(t);
    sumTPowK += tK;
    sumTPowKLnT += tK * lnT;
    sumTPowKLn2T += tK * lnT * lnT;
  }
  return (sumLnT / n) * (sumTPowK + k * sumTPowKLnT) - k * sumTPowKLn2T;
}

/** Логарифм функции правдоподобия Weibull — используется для выбора лучшего из трёх стартов */
function logLikelihood(
  k: number,
  lambda: number,
  times: number[],
  n: number,
): number {
  let sumLnT = 0;
  let sumTPowKOverLambdaK = 0;
  for (const t of times) {
    sumLnT += Math.log(t);
    sumTPowKOverLambdaK += Math.pow(t / lambda, k);
  }
  return (
    n * Math.log(k / lambda) +
    (k - 1) * sumLnT -
    (k - 1) * n * Math.log(lambda) -
    sumTPowKOverLambdaK
  );
}

/** Один запуск Ньютона-Рафсона от стартового k0. Возвращает найденное k и флаг сходимости */
function newtonRaphsonFit(
  times: number[],
  k0: number,
  tolerance: number,
  maxIterations: number,
): { k: number; converged: boolean } {
  const n = times.length;
  let sumLnT = 0;
  for (const t of times) {
    sumLnT += Math.log(t);
  }

  let k = k0;
  let converged = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    const gVal = g(k, times, n, sumLnT);
    const gPrime = gDerivative(k, times, n, sumLnT);
    if (gPrime === 0 || !Number.isFinite(gPrime)) break;

    const kNext = k - gVal / gPrime;
    if (!Number.isFinite(kNext) || kNext <= 0) break;

    if (Math.abs(kNext - k) < tolerance) {
      k = kNext;
      converged = true;
      break;
    }
    k = kNext;
  }
  return { k, converged };
}

/**
 * MLE-оценка параметров Weibull-распределения методом Ньютона-Рафсона.
 * Запускается от трёх стартовых значений k₀ ∈ {0.1, 1, 10} — защита от локальной сходимости.
 * Выбирается результат с наибольшим log-likelihood.
 * Источник: Liu, C.; White, R. W.; Dumais, S. (2010). SIGIR'10. DOI: 10.1145/1835449.1835513.
 */
export function fitWeibullMLE(
  times: number[],
  tolerance = 1e-6,
  maxIterations = 100,
): WeibullFitResult {
  const validTimes = times.filter((t) => t > 0);
  const n = validTimes.length;

  if (n < 2) {
    throw new Error('Недостаточно данных для фита Weibull (нужно минимум 2 наблюдения > 0)');
  }

  const startValues = [0.1, 1, 10];
  let best: WeibullFitResult | null = null;

  for (const k0 of startValues) {
    const { k, converged } = newtonRaphsonFit(validTimes, k0, tolerance, maxIterations);
    if (!Number.isFinite(k) || k <= 0) continue;

    let sumTPowK = 0;
    for (const t of validTimes) {
      sumTPowK += Math.pow(t, k);
    }
    const lambda = Math.pow(sumTPowK / n, 1 / k);
    if (!Number.isFinite(lambda) || lambda <= 0) continue;

    const ll = logLikelihood(k, lambda, validTimes, n);
    if (best === null || ll > best.logLikelihood) {
      best = { k, lambda, logLikelihood: ll, sampleSize: n, converged };
    }
  }

  if (best === null) {
    throw new Error('MLE fit failed for all initial values of k');
  }
  return best;
}