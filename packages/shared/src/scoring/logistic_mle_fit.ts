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
  return 1 / (1 + Math.exp(-z));
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

  const aug: number[][] = M.map((row, i) => {
    const identity = Array.from({ length: n }, (_, j) => (i === j ? 1 : 0));
    return [...row, ...identity];
  });

  for (let i = 0; i < n; i++) {
    const rowI = aug[i];
    if (rowI === undefined) throw new Error('invertMatrix: внутренняя ошибка индексации');

    const pivotVal = rowI[i] ?? 0;
    const safePivot = Math.abs(pivotVal) < 1e-12 ? 1e-12 : pivotVal;

    for (let j = 0; j < 2 * n; j++) {
      rowI[j] = (rowI[j] ?? 0) / safePivot;
    }

    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const rowK = aug[k];
      if (rowK === undefined) continue;
      const factor = rowK[i] ?? 0;
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
): LogisticFitResult {
  const n = X.length;
  if (n < 2) {
    throw new Error('fitLogisticMLE: недостаточно наблюдений (минимум 2)');
  }

  const firstRow = X[0];
  if (firstRow === undefined) {
    throw new Error('fitLogisticMLE: пустая матрица признаков');
  }
  const p = firstRow.length;

  let beta: number[] = Array(p).fill(0) as number[];
  let converged = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Вероятности p_i = sigmoid(x_i · β)
    const probs = X.map((row) =>
      sigmoid(row.reduce((s, x, j) => s + x * (beta[j] ?? 0), 0)),
    );

    // Градиент: ∇β = Xᵗ(y − p)
    const gradient: number[] = Array(p).fill(0) as number[];
    for (let j = 0; j < p; j++) {
      let g = 0;
      for (let i = 0; i < n; i++) {
        g += (X[i]?.[j] ?? 0) * ((y[i] ?? 0) - (probs[i] ?? 0.5));
      }
      gradient[j] = g;
    }

    // Весовая матрица W = diag(p_i × (1 − p_i))
    const W = probs.map((pi) => pi * (1 - pi));

    // Гессиан: H = XᵗWX
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
        const rowA = XtWX[a];
        if (rowA !== undefined) rowA[b] = val;
      }
    }

    // Шаг IRLS: β^(m+1) = β^(m) + H⁻¹∇β
    let hessianInv: number[][];
    try {
      hessianInv = invertMatrix(XtWX);
    } catch {
      break;
    }

    // gradient как столбцовая матрица p×1 для matMul
    const gradMatrix = gradient.map((g) => [g]);
    const deltaMatrix = matMul(hessianInv, gradMatrix);
    const delta = deltaMatrix.map((row) => row[0] ?? 0);

    const newBeta = beta.map((b, j) => b + (delta[j] ?? 0));
    const diff = Math.sqrt(
      newBeta.reduce((s, b, j) => s + (b - (beta[j] ?? 0)) ** 2, 0),
    );

    beta = newBeta;

    if (diff < tolerance) {
      converged = true;
      break;
    }
  }

  // Финальные метрики на полной выборке
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

  return { beta, logLikelihood, sampleSize: n, accuracy, converged };
}