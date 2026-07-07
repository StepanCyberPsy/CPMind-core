import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { ivtListConfigs, type IvtListConfigSelect } from '../db/schema.js';
import type { IvtListEntry } from '@cpmind/shared';
import { IvtListEntrySchema } from '@cpmind/shared';

const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
const REGEX_COMPILE_TIMEOUT_MS = 100;

class IvtListServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'IvtListServiceError';
  }
}

let cache: IvtListEntry[] | null = null;

export function invalidateIvtListCache(): void {
  cache = null;
}

export async function getActiveIvtList(): Promise<IvtListEntry[] | null> {
  if (cache !== null) return cache;

  const rows = await db
    .select()
    .from(ivtListConfigs)
    .where(eq(ivtListConfigs.isActive, true))
    .limit(1);

  if (!rows.length) return null;

  const entries = rows[0]!.entries as IvtListEntry[];
  cache = entries;
  return cache;
}

export async function listIvtListConfigs(): Promise<IvtListConfigSelect[]> {
  return db
    .select()
    .from(ivtListConfigs)
    .orderBy(ivtListConfigs.createdAt);
}

// Валидирует regex-паттерн: компилируется ли и не вызывает ли катастрофический бэктрекинг
function validateRegexPattern(pattern: string): boolean {
  const start = Date.now();
  try {
    new RegExp(pattern, 'i');
    // Тест на бэктрекинг: прогоняем потенциально дорогой паттерн против тестовой строки
    const testStr = 'a'.repeat(20) + '!';
    new RegExp(pattern, 'i').test(testStr);
    return Date.now() - start < REGEX_COMPILE_TIMEOUT_MS;
  } catch {
    return false;
  }
}

function validateCidr(pattern: string): boolean {
  if (!CIDR_REGEX.test(pattern)) return false;
  const [ip, prefixStr] = pattern.split('/');
  const prefix = Number(prefixStr);
  if (prefix < 0 || prefix > 32) return false;
  const octets = ip!.split('.').map(Number);
  return octets.every((o) => o >= 0 && o <= 255);
}

export interface ParseCsvResult {
  entries: IvtListEntry[];
  errors: Array<{ line: number; reason: string }>;
}

export function parseIvtListCsv(csv: string): ParseCsvResult {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  const entries: IvtListEntry[] = [];
  const errors: Array<{ line: number; reason: string }> = [];

  // Пропускаем заголовок
  const dataLines = lines[0]?.startsWith('type,') ? lines.slice(1) : lines;

  for (let i = 0; i < dataLines.length; i++) {
    const lineNum = i + 2;
    const line = dataLines[i];
    if (!line) continue;

    const cols = line.split(',');
    if (cols.length < 4) {
      errors.push({ line: lineNum, reason: 'Недостаточно колонок (минимум: type,pattern,match_type,category)' });
      continue;
    }

    const raw = {
      type: cols[0]?.trim(),
      pattern: cols[1]?.trim(),
      match_type: cols[2]?.trim(),
      category: cols[3]?.trim(),
      reason: cols[4]?.trim() || undefined,
      source: cols[5]?.trim() || undefined,
    };

    const parsed = IvtListEntrySchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({ line: lineNum, reason: parsed.error.errors[0]?.message ?? 'Невалидная запись' });
      continue;
    }

    const entry = parsed.data;

    if (entry.match_type === 'regex' && !validateRegexPattern(entry.pattern)) {
      errors.push({ line: lineNum, reason: `Невалидный или опасный regex: ${entry.pattern}` });
      continue;
    }

    if (entry.match_type === 'cidr' && !validateCidr(entry.pattern)) {
      errors.push({ line: lineNum, reason: `Невалидный CIDR: ${entry.pattern}` });
      continue;
    }

    entries.push(entry);
  }

  return { entries, errors };
}

export async function createIvtListConfig(data: {
  version: string;
  entries: IvtListEntry[];
  description?: string;
}): Promise<IvtListConfigSelect> {
  const rows = await db
    .insert(ivtListConfigs)
    .values({
      version: data.version,
      entries: data.entries as unknown as Record<string, unknown>[],
      description: data.description ?? null,
      isActive: false,
      entriesCount: data.entries.length,
    })
    .returning();

  return rows[0]!;
}

export async function activateIvtListConfig(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await tx
      .select({ id: ivtListConfigs.id })
      .from(ivtListConfigs)
      .where(eq(ivtListConfigs.id, id))
      .limit(1);

    if (!target.length) {
      throw new IvtListServiceError(
        'Конфигурация списка не найдена',
        404,
        'IVT_LIST_NOT_FOUND',
      );
    }

    await tx
      .update(ivtListConfigs)
      .set({ isActive: false })
      .where(eq(ivtListConfigs.isActive, true));

    await tx
      .update(ivtListConfigs)
      .set({ isActive: true })
      .where(eq(ivtListConfigs.id, id));
  });

  invalidateIvtListCache();
}

export async function deactivateIvtListConfig(id: string): Promise<void> {
  const rows = await db
    .update(ivtListConfigs)
    .set({ isActive: false })
    .where(eq(ivtListConfigs.id, id))
    .returning({ id: ivtListConfigs.id });

  if (!rows.length) {
    throw new IvtListServiceError(
      'Конфигурация списка не найдена',
      404,
      'IVT_LIST_NOT_FOUND',
    );
  }

  invalidateIvtListCache();
}