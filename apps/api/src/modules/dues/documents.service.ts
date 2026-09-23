import { Injectable } from '@nestjs/common';
import { formatKurusTl, type Kurus } from '@apartman/shared';
import * as ExcelJSModule from 'exceljs';
import * as pdfmakeModule from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import robotoFonts from 'pdfmake/fonts/Roboto';
import path from 'node:path';

const pdfmake = ((pdfmakeModule as unknown as { default?: typeof pdfmakeModule }).default ??
  pdfmakeModule) as typeof pdfmakeModule;

const ExcelJS = ((ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default ??
  ExcelJSModule) as typeof ExcelJSModule;

const fontDir = path.dirname(robotoFonts.Roboto.normal);
pdfmake.setFonts(robotoFonts);
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((filePath) =>
  path.resolve(filePath).startsWith(path.resolve(fontDir)),
);

export interface TableColumn<T> {
  header: string;
  value: (row: T) => string | number | null;
  money?: boolean;
  width?: number | '*' | 'auto';
  align?: 'left' | 'right' | 'center';
}

export interface ReportDefinition<T> {
  title: string;
  subtitle?: string;
  columns: TableColumn<T>[];
  rows: T[];
  summary?: [string, string][];
}

const formatCell = (value: string | number | null, money: boolean | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (money && typeof value === 'number') return formatKurusTl(value as Kurus);
  return String(value);
};

@Injectable()
export class DocumentsService {
  async reportPdf<T>(report: ReportDefinition<T>): Promise<Buffer> {
    const body = [
      report.columns.map((c) => ({
        text: c.header,
        style: 'th',
        alignment: c.align ?? (c.money ? 'right' : 'left'),
      })),
      ...report.rows.map((row) =>
        report.columns.map((c) => ({
          text: formatCell(c.value(row), c.money),
          alignment: c.align ?? (c.money ? 'right' : 'left'),
        })),
      ),
    ];

    const content: Content[] = [
      { text: report.title, style: 'title' },
      ...(report.subtitle ? [{ text: report.subtitle, style: 'subtitle' } as Content] : []),
      {
        table: {
          headerRows: 1,
          widths: report.columns.map((c) => c.width ?? 'auto'),
          body,
        },
        layout: 'lightHorizontalLines',
      },
    ];
    if (report.summary?.length) {
      content.push({
        margin: [0, 12, 0, 0],
        table: {
          widths: ['*', 'auto'],
          body: report.summary.map(([label, value]) => [
            { text: label, alignment: 'right' },
            { text: value, bold: true, alignment: 'right' },
          ]),
        },
        layout: 'noBorders',
      });
    }
    return this.render(content, report.columns.length > 6 ? 'landscape' : 'portrait');
  }

  async reportXlsx<T>(report: ReportDefinition<T>): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Apartman Yönetim Sistemi';
    const sheet = workbook.addWorksheet(report.title.slice(0, 31));
    sheet.addRow([report.title]).font = { bold: true, size: 14 };
    if (report.subtitle) sheet.addRow([report.subtitle]);
    sheet.addRow([]);
    const header = sheet.addRow(report.columns.map((c) => c.header));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    });
    for (const row of report.rows) {
      const excelRow = sheet.addRow(
        report.columns.map((c) => {
          const value = c.value(row);
          return c.money && typeof value === 'number' ? value / 100 : (value ?? '');
        }),
      );
      report.columns.forEach((c, i) => {
        if (c.money) excelRow.getCell(i + 1).numFmt = '#,##0.00 "TL"';
      });
    }
    if (report.summary?.length) {
      sheet.addRow([]);
      for (const [label, value] of report.summary)
        sheet.addRow([label, value]).font = { bold: true };
    }
    sheet.columns.forEach((column, i) => {
      column.width = Math.max(12, Math.min(40, (report.columns[i]?.header.length ?? 10) + 6));
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async render(
    content: Content[],
    orientation: 'portrait' | 'landscape' = 'portrait',
  ): Promise<Buffer> {
    const created = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    const doc: TDocumentDefinitions = {
      pageSize: 'A4',
      pageOrientation: orientation,
      pageMargins: [36, 40, 36, 48],
      defaultStyle: { font: 'Roboto', fontSize: 9 },
      styles: {
        title: { fontSize: 15, bold: true, margin: [0, 0, 0, 4] },
        subtitle: { fontSize: 10, color: '#555555', margin: [0, 0, 0, 12] },
        th: { bold: true, fillColor: '#f2f2f2' },
      },
      content,
      footer: (currentPage, pageCount) => ({
        columns: [
          { text: `Oluşturulma: ${created}`, fontSize: 7, color: '#777777' },
          {
            text: `Sayfa ${currentPage} / ${pageCount}`,
            alignment: 'right',
            fontSize: 7,
            color: '#777777',
          },
        ],
        margin: [36, 16, 36, 0],
      }),
    };
    return pdfmake.createPdf(doc).getBuffer();
  }
}
