import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import type {PrintableReportSpec} from "@/lib/admin/reports/admin-report-modules-types";

// A4 Landscape dimensions (points) for clean wide business report tables.
const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN_X = 36;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const EMERALD = rgb(0.031, 0.443, 0.349); // #087159
const EMERALD_DARK = rgb(0.016, 0.259, 0.204);
const EMERALD_TINT = rgb(0.929, 0.969, 0.957);
const SURFACE_SUBTLE = rgb(0.969, 0.976, 0.973);
const BORDER_GRAY = rgb(0.84, 0.87, 0.86);
const INK_PRIMARY = rgb(0.11, 0.14, 0.13);
const INK_MUTED = rgb(0.38, 0.44, 0.42);

export function sanitizePdfText(value: string): string {
  return value
    .replace(/₱/gu, "PHP ")
    .replace(/[–—]/gu, "-")
    .replace(/[‘’]/gu, "'")
    .replace(/[“”]/gu, '"')
    .replace(/…/gu, "...")
    .replace(/·/gu, "|")
    .replace(/•/gu, "*")
    .replace(/\u00a0/gu, " ")
    .replace(/[^\x20-\x7e\u00a1-\u00ff]/gu, "?")
    .replace(/\s+/gu, " ")
    .trim();
}

export async function createSubModuleReportPdf(
  spec: PrintableReportSpec,
): Promise<{
  blob: Blob;
  bytes: Uint8Array;
  fileName: string;
}> {
  const document = await PDFDocument.create();
  document.setTitle(sanitizePdfText(spec.title));
  document.setAuthor("FEASTA");
  document.setSubject(sanitizePdfText(spec.subtitle));

  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  const totalWeight = Math.max(
    1,
    spec.columns.reduce((sum, column) => sum + column.weight, 0),
  );
  const columnWidths = spec.columns.map(
    (column) => (column.weight / totalWeight) * CONTENT_WIDTH,
  );

  const generatedLabel = formatGeneratedTimestamp(spec.generatedAt);

  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN_TOP;

  // Header band
  page.drawRectangle({
    x: MARGIN_X,
    y: cursorY - 4,
    width: CONTENT_WIDTH,
    height: 4,
    color: EMERALD,
  });
  cursorY -= 20;

  page.drawText("FEASTA", {
    x: MARGIN_X,
    y: cursorY,
    size: 10,
    font: bold,
    color: EMERALD,
  });
  const metaRight = sanitizePdfText(`Generated: ${generatedLabel} (Asia/Manila)`);
  page.drawText(metaRight, {
    x: PAGE_WIDTH - MARGIN_X - regular.widthOfTextAtSize(metaRight, 8.5),
    y: cursorY,
    size: 8.5,
    font: regular,
    color: INK_MUTED,
  });
  cursorY -= 20;

  page.drawText(sanitizePdfText(spec.title), {
    x: MARGIN_X,
    y: cursorY,
    size: 16,
    font: bold,
    color: EMERALD_DARK,
  });
  cursorY -= 15;

  page.drawText(
    sanitizePdfText(`Period: ${spec.periodLabel}   |   ${spec.filterSummary}`),
    {
      x: MARGIN_X,
      y: cursorY,
      size: 9,
      font: regular,
      color: INK_MUTED,
    },
  );
  cursorY -= 14;

  // Summary strip
  if (spec.summary.length > 0) {
    const summaryHeight = 36;
    const summaryY = cursorY - summaryHeight;
    page.drawRectangle({
      x: MARGIN_X,
      y: summaryY,
      width: CONTENT_WIDTH,
      height: summaryHeight,
      color: SURFACE_SUBTLE,
      borderColor: BORDER_GRAY,
      borderWidth: 0.75,
    });

    const slotWidth = CONTENT_WIDTH / spec.summary.length;
    spec.summary.forEach((item, index) => {
      const slotX = MARGIN_X + index * slotWidth + 10;
      if (index > 0) {
        page.drawLine({
          start: {x: MARGIN_X + index * slotWidth, y: summaryY + 6},
          end: {x: MARGIN_X + index * slotWidth, y: summaryY + summaryHeight - 6},
          thickness: 0.5,
          color: BORDER_GRAY,
        });
      }
      page.drawText(
        truncateToWidth(sanitizePdfText(item.label), regular, 8, slotWidth - 16),
        {
          x: slotX,
          y: summaryY + summaryHeight - 13,
          size: 8,
          font: regular,
          color: INK_MUTED,
        },
      );
      page.drawText(
        truncateToWidth(sanitizePdfText(item.value), bold, 10.5, slotWidth - 16),
        {
          x: slotX,
          y: summaryY + 8,
          size: 10.5,
          font: bold,
          color: EMERALD_DARK,
        },
      );
    });
    cursorY = summaryY - 14;
  }

  const drawTableHeader = (targetPage: PDFPage, topY: number): number => {
    const headerHeight = 22;
    const bottomY = topY - headerHeight;
    targetPage.drawRectangle({
      x: MARGIN_X,
      y: bottomY,
      width: CONTENT_WIDTH,
      height: headerHeight,
      color: EMERALD_TINT,
      borderColor: BORDER_GRAY,
      borderWidth: 0.75,
    });

    let cellX = MARGIN_X;
    spec.columns.forEach((column, index) => {
      const width = columnWidths[index];
      const textValue = truncateToWidth(
        sanitizePdfText(column.header),
        bold,
        8.5,
        width - 10,
      );
      const textWidth = bold.widthOfTextAtSize(textValue, 8.5);
      const drawX =
        column.align === "right"
          ? cellX + width - 5 - textWidth
          : cellX + 5;
      targetPage.drawText(textValue, {
        x: drawX,
        y: bottomY + 7,
        size: 8.5,
        font: bold,
        color: EMERALD_DARK,
      });
      cellX += width;
    });

    return bottomY;
  };

  const startContinuationPage = (): number => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let nextY = PAGE_HEIGHT - MARGIN_TOP;
    page.drawText(
      sanitizePdfText(`${spec.title} (continued) - ${spec.periodLabel}`),
      {
        x: MARGIN_X,
        y: nextY - 8,
        size: 9.5,
        font: bold,
        color: INK_MUTED,
      },
    );
    nextY -= 20;
    return drawTableHeader(page, nextY);
  };

  cursorY = drawTableHeader(page, cursorY);

  if (spec.rows.length === 0) {
    const emptyHeight = 32;
    const bottomY = cursorY - emptyHeight;
    page.drawRectangle({
      x: MARGIN_X,
      y: bottomY,
      width: CONTENT_WIDTH,
      height: emptyHeight,
      borderColor: BORDER_GRAY,
      borderWidth: 0.5,
    });
    page.drawText("No records match the selected report filters.", {
      x: MARGIN_X + 10,
      y: bottomY + 12,
      size: 9,
      font: regular,
      color: INK_MUTED,
    });
  } else {
    const fontSize = 8;
    const lineHeight = 10.5;
    const verticalPad = 5;

    spec.rows.forEach((row, rowIndex) => {
      const wrappedCells = spec.columns.map((column, columnIndex) =>
        wrapText(
          sanitizePdfText(row[column.key] ?? ""),
          regular,
          fontSize,
          Math.max(24, columnWidths[columnIndex] - 10),
          3,
        ),
      );
      const maxLines = Math.max(1, ...wrappedCells.map((lines) => lines.length));
      const rowHeight = maxLines * lineHeight + verticalPad * 2;

      if (cursorY - rowHeight < MARGIN_BOTTOM) {
        cursorY = startContinuationPage();
      }

      const bottomY = cursorY - rowHeight;
      if (rowIndex % 2 === 1) {
        page.drawRectangle({
          x: MARGIN_X,
          y: bottomY,
          width: CONTENT_WIDTH,
          height: rowHeight,
          color: SURFACE_SUBTLE,
        });
      }
      page.drawLine({
        start: {x: MARGIN_X, y: bottomY},
        end: {x: MARGIN_X + CONTENT_WIDTH, y: bottomY},
        thickness: 0.5,
        color: BORDER_GRAY,
      });

      let cellX = MARGIN_X;
      spec.columns.forEach((column, columnIndex) => {
        const width = columnWidths[columnIndex];
        const lines = wrappedCells[columnIndex];
        lines.forEach((line, lineIndex) => {
          const textWidth = regular.widthOfTextAtSize(line, fontSize);
          const drawX =
            column.align === "right"
              ? cellX + width - 5 - textWidth
              : cellX + 5;
          const drawY =
            cursorY - verticalPad - fontSize - lineIndex * lineHeight;
          page.drawText(line, {
            x: drawX,
            y: drawY,
            size: fontSize,
            font: regular,
            color: INK_PRIMARY,
          });
        });
        cellX += width;
      });

      cursorY = bottomY;
    });
  }

  const pages = document.getPages();
  const totalPages = pages.length;
  pages.forEach((targetPage, index) => {
    targetPage.drawLine({
      start: {x: MARGIN_X, y: MARGIN_BOTTOM - 12},
      end: {x: PAGE_WIDTH - MARGIN_X, y: MARGIN_BOTTOM - 12},
      thickness: 0.5,
      color: BORDER_GRAY,
    });
    targetPage.drawText("FEASTA Administration Report - Confidential", {
      x: MARGIN_X,
      y: MARGIN_BOTTOM - 24,
      size: 8,
      font: regular,
      color: INK_MUTED,
    });
    const pageLabel = `Page ${index + 1} of ${totalPages}`;
    targetPage.drawText(pageLabel, {
      x: PAGE_WIDTH - MARGIN_X - regular.widthOfTextAtSize(pageLabel, 8),
      y: MARGIN_BOTTOM - 24,
      size: 8,
      font: regular,
      color: INK_MUTED,
    });
  });

  const bytes = await document.save();
  const safeBytes = new Uint8Array(bytes.byteLength);
  safeBytes.set(bytes);
  const blob = new Blob([safeBytes], {type: "application/pdf"});
  const stamp = spec.generatedAt.slice(0, 10) || "report";

  return {
    blob,
    bytes: safeBytes,
    fileName: `${spec.fileSlug}-${stamp}.pdf`,
  };
}

export async function downloadSubModuleReportPdf(
  spec: PrintableReportSpec,
): Promise<string> {
  const exported = await createSubModuleReportPdf(spec);
  const downloadUrl = URL.createObjectURL(exported.blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = exported.fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 1_000);
  return exported.fileName;
}

function wrapText(
  textValue: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  if (!textValue) return ["-"];
  const words = textValue.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      if (lines.length === maxLines - 1) {
        current = word;
        break;
      }
      current = word;
    } else {
      lines.push(truncateToWidth(word, font, size, maxWidth));
      current = "";
      if (lines.length === maxLines) break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(truncateToWidth(current, font, size, maxWidth));
  }

  return lines.length > 0 ? lines.slice(0, maxLines) : ["-"];
}

function truncateToWidth(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  const suffix = "...";
  let trimmed = value;
  while (
    trimmed.length > 1 &&
    font.widthOfTextAtSize(`${trimmed}${suffix}`, size) > maxWidth
  ) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}${suffix}`;
}

function formatGeneratedTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}
