export type SortField =
  | 'createdAt'
  | 'scoreFinal'
  | 's1Normalized'
  | 's2Normalized'
  | 's3Normalized'
  | 's4Normalized'
  | 's5Normalized'
  | 's7Normalized';

export interface SortParams {
  sortBy: SortField;
  sortDir: 'asc' | 'desc';
}

export interface PaginationProps {
  currentPage: number;
  pageCount: number;
}