import type { LogisticParams } from './signal_defaults.js';
export type { LogisticParams };

export interface LogisticFitResult {
  beta: number[];
  logLikelihood: number;
  sampleSize: number;
  accuracy: number;
  converged: boolean;
}

function sigmoid(z: number): number {
  if (z >= 0) {
    return 1 / (1 + Math.exp(-z));
  }

  const expZ = Math.exp(z);
  return expZ / (1 + expZ);
}

function matMul(
  A: number[][],
  B: number[][],
): number[][] {
  const rows = A.length;
  const cols = B[0]?.length ?? 0;
  const inner = B.length;
  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => {
      let sum = 0;
      for (let k = 0; k < inner; k++) {
        sum += (A[i]?.[k] ?? 0) * (B[k]?.[j] ?? 0);
      }
      return sum;
    }),
  );
}

/**
 * Гауссово исключение для вычисления обратной матрицы p×p.
 * Используется для шага IRLS: H⁻¹ = (XᵗWX)⁻¹
 */
function invertMatrix(M: number[][]): number[][] {
  const n = M.length;
  if (n === 0) throw new Error('invertMatrix: пустая матрица');

  if (M.some((row) => row.length !== n)) {
    throw new Error('invertMatrix: матрица должна быть квадратной');
  }

  const aug: number[][] = M.map((row, i) => {
    const identity = Array.from({ length: n }, (_, j) => (i === j ? 1 : 0));
    return [...row, ...identity];
  });

  for (let i = 0; i < n; i++) {
    let pivotRow = i;
    let pivotAbs = Math.abs(aug[i]?.[i] ?? 0);

    for (let k = i + 1; k < n; k++) {
      const candidateAbs = Math.abs(aug[k]?.[i] ?? 0);

      if (candidateAbs > pivotAbs) {
        pivotAbs = candidateAbs;
        pivotRow = k;
      }
    }

    if (pivotAbs < 1e-12) {
      throw new Error('invertMatrix: вырожденная матрица');
    }

    if (pivotRow !== i) {
      const currentRow = aug[i];
      const selectedRow = aug[pivotRow];

      if (currentRow === undefined || selectedRow === undefined) {
        throw new Error('invertMatrix: внутренняя ошибка индексации');
      }

      aug[i] = selectedRow;
      aug[pivotRow] = currentRow;
    }

    const rowI = aug[i];
    if (rowI === undefined) {
      throw new Error('invertMatrix: внутренняя ошибка индексации');
    }

    const pivotVal = rowI[i];
    if (pivotVal === undefined) {
      throw new Error('invertMatrix: внутренняя ошибка pivot');
    }

    for (let j = 0; j < 2 * n; j++) {
      rowI[j] = (rowI[j] ?? 0) / pivotVal;
    }

    for (let k = 0; k < n; k++) {
      if (k === i) continue;

      const rowK = aug[k];
      if (rowK === undefined) {
        throw new Error('invertMatrix: внутренняя ошибка индексации');
      }

      const factor = rowK[i] ?? 0;
      if (factor === 0) continue;

      for (let j = 0; j < 2 * n; j++) {
        rowK[j] = (rowK[j] ?? 0) - factor * (rowI[j] ?? 0);
      }
    }
  }

  return aug.map((row) => row.slice(n));
}

/**
 * MLE-оценка коэффициентов логистической регрессии методом IRLS (Newton-Raphson).
 * X — матрица признаков n×p, первый столбец — intercept = 1.
 * y — вектор бинарных меток n×1 ∈ {0, 1}.
 * Источник: Bishop (2006), Pattern Recognition and Machine Learning, §4.3.3;
 * аналогия с S1: Liu et al. (2010), SIGIR'10.
 */
export function fitLogisticMLE(
  X: number[][],
  y: number[],
  tolerance = 1e-6,
  maxIterations = 100,
  l2Lambda = 0,
): LogisticFitResult {
  const n = X.length;
  if (n < 2) {
    throw new Error('fitLogisticMLE: недостаточно наблюдений (минимум 2)');
  }

  if (y.length !== n) {
    throw new Error('fitLogisticMLE: размеры X и y не совпадают');
  }

  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error('fitLogisticMLE: tolerance должен быть положительным числом');
  }

  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new Error('fitLogisticMLE: maxIterations должен быть положительным целым числом');
  }

  if (!Number.isFinite(l2Lambda) || l2Lambda < 0) {
    throw new Error('fitLogisticMLE: l2Lambda должен быть неотрицательным числом');
  }

  const firstRow = X[0];
  if (firstRow === undefined || firstRow.length === 0) {
    throw new Error('fitLogisticMLE: пустая матрица признаков');
  }

  const p = firstRow.length;

  for (const row of X) {
    if (row.length !== p) {
      throw new Error('fitLogisticMLE: строки X имеют разную размерность');
    }

    if (row.some((value) => !Number.isFinite(value))) {
      throw new Error('fitLogisticMLE: X содержит нечисловые или бесконечные значения');
    }
  }

  if (y.some((label) => label !== 0 && label !== 1)) {
    throw new Error('fitLogisticMLE: y должен содержать только 0 и 1');
  }

  let beta: number[] = Array(p).fill(0) as number[];
  let converged = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    const probs = X.map((row) =>
      sigmoid(row.reduce((s, x, j) => s + x * (beta[j] ?? 0), 0)),
    );

    const gradient: number[] = Array(p).fill(0) as number[];

    for (let j = 0; j < p; j++) {
      let g = 0;

      for (let i = 0; i < n; i++) {
        g += (X[i]?.[j] ?? 0) * ((y[i] ?? 0) - (probs[i] ?? 0.5));
      }

      if (j > 0 && l2Lambda > 0) {
        g -= l2Lambda * (beta[j] ?? 0);
      }

      gradient[j] = g;
    }

    const W = probs.map((pi) => pi * (1 - pi));

    const XtWX: number[][] = Array.from(
      { length: p },
      () => Array(p).fill(0) as number[],
    );

    for (let a = 0; a < p; a++) {
      for (let b = 0; b < p; b++) {
        let val = 0;

        for (let i = 0; i < n; i++) {
          val += (X[i]?.[a] ?? 0) * (W[i] ?? 0) * (X[i]?.[b] ?? 0);
        }

        if (a === b && a > 0 && l2Lambda > 0) {
          val += l2Lambda;
        }

        const rowA = XtWX[a];
        if (rowA !== undefined) {
          rowA[b] = val;
        }
      }
    }

    let hessianInv: number[][];

    try {
      hessianInv = invertMatrix(XtWX);
    } catch {
      break;
    }

    const gradMatrix = gradient.map((g) => [g]);
    const deltaMatrix = matMul(hessianInv, gradMatrix);
    const delta = deltaMatrix.map((row) => row[0] ?? 0);

    if (delta.some((value) => !Number.isFinite(value))) {
      break;
    }

    const newBeta = beta.map((b, j) => b + (delta[j] ?? 0));

    if (newBeta.some((value) => !Number.isFinite(value))) {
      break;
    }

    const diff = Math.sqrt(
      newBeta.reduce((s, b, j) => s + (b - (beta[j] ?? 0)) ** 2, 0),
    );

    if (!Number.isFinite(diff)) {
      break;
    }

    beta = newBeta;

    if (diff < tolerance) {
      converged = true;
      break;
    }
  }

  const finalProbs = X.map((row) =>
    sigmoid(row.reduce((s, x, j) => s + x * (beta[j] ?? 0), 0)),
  );

  const logLikelihood = finalProbs.reduce((s, pi, i) => {
    const yi = y[i] ?? 0;

    return s + (yi === 1
      ? Math.log(Math.max(pi, 1e-12))
      : Math.log(Math.max(1 - pi, 1e-12)));
  }, 0);

  const accuracy =
    finalProbs.reduce((s, pi, i) => {
      const pred = pi >= 0.5 ? 1 : 0;
      return s + (pred === (y[i] ?? 0) ? 1 : 0);
    }, 0) / n;

  return {
    beta,
    logLikelihood,
    sampleSize: n,
    accuracy,
    converged,
  };
}