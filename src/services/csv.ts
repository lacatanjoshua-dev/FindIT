// Small helper for downloading a table as a CSV file that opens in Excel.

type Cell = string | number | boolean | null | undefined;

// Wraps a value in quotes when needed and blocks spreadsheet formulas
// (a cell that starts with = + - @ could run as a formula in Excel).
const toCsvCell = (value: Cell): string => {
  let text = value === null || value === undefined ? '' : String(value);

  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  if (/[",\n\r]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

/**
 * Downloads rows as a .csv file.
 * The first row should be the column headers.
 */
export const downloadCsv = (fileName: string, rows: Cell[][]) => {
  const csv = rows.map((row) => row.map(toCsvCell).join(',')).join('\r\n');

  // The BOM at the start makes Excel read accents and symbols correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** "2026-11-11" style date for file names. */
export const todayStamp = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day}`;
};