import "server-only";

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import {formatPhilippineDate} from "@/lib/dates/philippine-date";
import {
  normalizePdfPunctuation,
  type ProviderAgreementPdfModel,
} from "@/lib/provider/provider-agreement-record";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const BOTTOM_MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export async function renderProviderAgreementPdf(
  model: ProviderAgreementPdfModel,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle("FEASTA Provider Agreement");
  document.setAuthor("FEASTA");
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const cursor = new PdfCursor(document);

  cursor.draw("FEASTA PROVIDER AGREEMENT", bold, 16, 22);
  cursor.gap(8);
  cursor.draw(model.name, bold, 13, 18);
  cursor.gap(6);
  cursor.draw(`Version: ${model.version}`, regular, 11, 15);
  cursor.draw(
    `Effective date: ${formatPhilippineDate(model.effectiveDate)}`,
    regular,
    11,
    15,
  );
  cursor.gap(12);

  for (const section of model.sections) {
    cursor.gap(8);
    cursor.draw(section.title, bold, 12, 16);
    cursor.gap(4);
    for (const paragraph of section.paragraphs) {
      cursor.draw(paragraph, regular, 11, 15);
      cursor.gap(6);
    }
  }

  if (model.acceptance) {
    cursor.gap(14);
    cursor.draw("ELECTRONIC ACCEPTANCE RECORD", bold, 12, 16);
    cursor.gap(6);
    cursor.draw(
      `Provider / Business: ${model.acceptance.businessName}`,
      regular,
      11,
      15,
    );
    cursor.draw(
      `Authorized Representative: ${model.acceptance.representativeName}`,
      regular,
      11,
      15,
    );
    cursor.draw(`Agreement Version: ${model.version}`, regular, 11, 15);
    cursor.draw(
      `Effective Date: ${formatPhilippineDate(model.effectiveDate)}`,
      regular,
      11,
      15,
    );
    cursor.draw(
      `Date and Time Accepted: ${model.acceptance.acceptedAtLabel}`,
      regular,
      11,
      15,
    );
    if (model.acceptance.providerId) {
      cursor.draw(
        `Provider ID: ${model.acceptance.providerId}`,
        regular,
        11,
        15,
      );
    }
    cursor.draw("Status: Electronically Accepted", regular, 11, 15);
  }

  const pages = document.getPages();
  const total = pages.length;
  pages.forEach((page, index) => {
    const label = `Page ${index + 1} of ${total}`;
    const width = regular.widthOfTextAtSize(label, 9);
    page.drawText(label, {
      x: (PAGE_WIDTH - width) / 2,
      y: 28,
      size: 9,
      font: regular,
      color: rgb(0.35, 0.35, 0.35),
    });
  });

  return document.save();
}

class PdfCursor {
  private page: PDFPage;
  private y: number;

  constructor(private readonly document: PDFDocument) {
    this.page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  gap(amount: number): void {
    this.y -= amount;
    if (this.y < BOTTOM_MARGIN) this.nextPage();
  }

  draw(text: string, font: PDFFont, size: number, lineHeight: number): void {
    const safe = pdfSafeText(text, font);
    const lines = wrapText(safe, font, size, CONTENT_WIDTH);
    const content = lines.length > 0 ? lines : [""];
    for (const line of content) {
      if (this.y - lineHeight < BOTTOM_MARGIN) this.nextPage();
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y - size,
        size,
        font,
        color: rgb(0.12, 0.12, 0.12),
      });
      this.y -= lineHeight;
    }
  }

  private nextPage(): void {
    this.page = this.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/u)) {
    const words = paragraph.split(/\s+/u).filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const pieces = splitLongWord(word, font, size, maxWidth);
      for (const piece of pieces) {
        const next = current ? `${current} ${piece}` : piece;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) {
          current = next;
          continue;
        }
        if (current) lines.push(current);
        current = piece;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function splitLongWord(
  word: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const pieces: string[] = [];
  let current = "";
  for (const character of word) {
    const next = current + character;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) pieces.push(current);
    current = character;
  }
  if (current) pieces.push(current);
  return pieces;
}

function pdfSafeText(value: string, font: PDFFont): string {
  const normalized = normalizePdfPunctuation(value);
  let result = "";
  for (const character of normalized) {
    if (character === "\n" || character === "\r" || character === "\t") {
      result += character === "\t" ? " " : character;
      continue;
    }
    try {
      font.encodeText(character);
      result += character;
    } catch {
      result += "?";
    }
  }
  return result;
}
