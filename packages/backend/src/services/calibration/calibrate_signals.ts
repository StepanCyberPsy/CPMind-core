import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pino from 'pino';
import { recalibrateS1Weibull } from '../../jobs/s1_weibull_recalibration.js';
import { recalibrateS3Logistic } from '../../jobs/s3_logistic_recalibration.js';
import { recalibrateS4 } from '../../jobs/s4_calibration.js';
import { recalibrateS5Logistic } from '../../jobs/s5_logistic_recalibration.js';
import { recalibrateS6Logistic } from '../../jobs/s6_logistic_recalibration.js';
import { recalibrateS7Quantiles } from '../../jobs/s7_quantile_recalibration.js';

const logger = pino({ name: 'calibrate-signals-service' });

export const CALIBRATABLE_SIGNALS = [
  's1',
  's3',
  's4',
  's5',
  's6',
  's7',
] as const;

export type CalibratableSignal = typeof CALIBRATABLE_SIGNALS[number];
export type CalibrationTarget = CalibratableSignal | 'all';

const CALIBRATION_RUNNERS: Record<
  CalibratableSignal,
  () => Promise<void>
> = {
  s1: recalibrateS1Weibull,
  s3: recalibrateS3Logistic,
  s4: recalibrateS4,
  s5: recalibrateS5Logistic,
  s6: recalibrateS6Logistic,
  s7: recalibrateS7Quantiles,
};

function isCalibratableSignal(
  value: string,
): value is CalibratableSignal {
  return (CALIBRATABLE_SIGNALS as readonly string[]).includes(value);
}

export function parseCalibrationTarget(
  value: unknown,
): CalibrationTarget {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Не указан сигнал для калибровки. Допустимые значения: ${CALIBRATABLE_SIGNALS.join(', ')}, all`,
    );
  }

  const normalized = value
    .trim()
    .toLowerCase();

  if (normalized === 'all') {
    return 'all';
  }

  if (normalized === 's2') {
    throw new Error(
      'S2 не имеет отдельной параметрической модели и процедуры recalibration',
    );
  }

  if (!isCalibratableSignal(normalized)) {
    throw new Error(
      `Неподдерживаемый сигнал "${value}". Допустимые значения: ${CALIBRATABLE_SIGNALS.join(', ')}, all`,
    );
  }

  return normalized;
}

export async function calibrateSignals(
  target: CalibrationTarget,
): Promise<void> {
  const signals: readonly CalibratableSignal[] = target === 'all'
    ? CALIBRATABLE_SIGNALS
    : [target];

  logger.info(
    {
      target,
      signals,
    },
    'Forced signal calibration started',
  );

  for (const signal of signals) {
    const startedAt = Date.now();
    const runner = CALIBRATION_RUNNERS[signal];

    logger.info(
      { signal },
      'Forced signal calibration running',
    );

    await runner();

    logger.info(
      {
        signal,
        durationMs: Date.now() - startedAt,
      },
      'Forced signal calibration completed',
    );
  }

  logger.info(
    { target },
    'Forced signal calibration finished',
  );
}

function isMainModule(): boolean {
  const entryPath = process.argv[1];

  if (entryPath === undefined) {
    return false;
  }

  return import.meta.url === pathToFileURL(
    resolve(entryPath),
  ).href;
}

async function runCli(): Promise<void> {
  try {
    const target = parseCalibrationTarget(
      process.argv[2],
    );

    await calibrateSignals(target);

    process.exit(0);
  } catch (err) {
    logger.error(
      { err },
      'Forced signal calibration failed',
    );

    process.exit(1);
  }
}

if (isMainModule()) {
  void runCli();
}