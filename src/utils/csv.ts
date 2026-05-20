import type { CsvColumn } from '@/types';

export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function arrayToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((column) => escapeCsvValue(column.header)).join(',');
  const body = rows.map((row) =>
    columns
      .map((column) => {
        const value = typeof column.accessor === 'function' ? column.accessor(row) : row[column.accessor];
        return escapeCsvValue(value);
      })
      .join(',')
  );

  return `\uFEFF${[header, ...body].join('\r\n')}`;
}

export function downloadCsvFile(csvContent: string, filename: string): void {
  const content = csvContent.startsWith('\uFEFF') ? csvContent : `\uFEFF${csvContent}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
