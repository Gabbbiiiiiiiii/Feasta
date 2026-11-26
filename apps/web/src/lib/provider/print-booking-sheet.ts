export type PrintableKeyValue = {
  label: string;
  value: string;
};

export type PrintableInclusionGroup = {
  title: string;
  items: string[];
};

export type PrintableDishGroup = {
  groupTitle: string;
  dishes: string[];
};

export type PrintableServiceLine = {
  name: string;
  detail?: string;
  amount: string;
};

export type PrintableAmountLine = {
  label: string;
  amount: string;
  highlight?: boolean;
  dividerAbove?: boolean;
};

export type PrintableNoteBlock = {
  title: string;
  body: string;
};

export type PrintableTimelineEntry = {
  title: string;
  description?: string;
  timestamp: string;
};

export type PrintableBookingSheet = {
  documentTitle: string;
  fileTitle: string;
  reference: string;
  status: string;
  submittedAt?: string;
  eventDetails: PrintableKeyValue[];
  customerDetails: PrintableKeyValue[];
  packageSummary?: {
    name: string;
    tier?: string;
    meta?: string;
    themeName?: string;
    themeDescription?: string;
    packageReference?: string;
    selectedDishes?: PrintableDishGroup[];
    inclusionGroups?: PrintableInclusionGroup[];
  };
  services?: PrintableServiceLine[];
  notes?: PrintableNoteBlock[];
  paymentSummary: {
    heading?: string;
    lines: PrintableAmountLine[];
    details?: string[];
    footnote?: string;
  };
  timeline?: PrintableTimelineEntry[];
  footerText: string;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderKeyValueRows(rows: PrintableKeyValue[]): string {
  return rows
    .filter((row) => row.value.trim() !== "")
    .map(
      (row) => `
        <tr>
          <th>${escapeHtml(row.label)}</th>
          <td>${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join("");
}

function renderPackageSection(
  pkg: NonNullable<PrintableBookingSheet["packageSummary"]>,
): string {
  const headerMetaParts = [
    pkg.tier ? `Tier: ${pkg.tier}` : "",
    pkg.meta ?? "",
  ].filter(Boolean);

  const themeHtml = pkg.themeName
    ? `<div class="sub-block">
        <div class="sub-label">Theme</div>
        <div class="sub-value"><strong>${escapeHtml(pkg.themeName)}</strong>${
          pkg.themeDescription
            ? `<div class="muted pre-wrap">${escapeHtml(pkg.themeDescription)}</div>`
            : ""
        }</div>
      </div>`
    : "";

  const dishesHtml =
    pkg.selectedDishes && pkg.selectedDishes.length > 0
      ? `<div class="sub-block">
          <div class="sub-label">Selected Dishes</div>
          <ul class="dish-group-list">
            ${pkg.selectedDishes
              .map(
                (group) =>
                  `<li><strong>${escapeHtml(group.groupTitle)}:</strong> ${escapeHtml(group.dishes.join(", "))}</li>`,
              )
              .join("")}
          </ul>
        </div>`
      : "";

  const inclusionsHtml =
    pkg.inclusionGroups && pkg.inclusionGroups.length > 0
      ? pkg.inclusionGroups
          .map(
            (group) => `
          <div class="sub-block">
            <div class="sub-label">${escapeHtml(group.title)} (${group.items.length})</div>
            <ul class="inclusion-grid">
              ${group.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </div>`,
          )
          .join("")
      : "";

  const refHtml = pkg.packageReference
    ? `<div class="footnote">Package reference: ${escapeHtml(pkg.packageReference)}</div>`
    : "";

  return `
    <section class="section">
      <div class="section-title">Package, Menu &amp; Inclusions</div>
      <div class="package-header">
        <div class="package-name">${escapeHtml(pkg.name)}</div>
        ${
          headerMetaParts.length > 0
            ? `<div class="package-meta">${escapeHtml(headerMetaParts.join("  |  "))}</div>`
            : ""
        }
      </div>
      ${themeHtml}
      ${dishesHtml}
      ${inclusionsHtml}
      ${refHtml}
    </section>`;
}

function renderServicesSection(services: PrintableServiceLine[]): string {
  if (services.length === 0) return "";
  return `
    <section class="section">
      <div class="section-title">Selected Services</div>
      <table class="line-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Details</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${services
            .map(
              (service) => `
            <tr>
              <td><strong>${escapeHtml(service.name)}</strong></td>
              <td>${escapeHtml(service.detail ?? "—")}</td>
              <td class="num">${escapeHtml(service.amount)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </section>`;
}

function renderNotesSection(notes: PrintableNoteBlock[]): string {
  const valid = notes.filter((note) => note.body.trim() !== "");
  if (valid.length === 0) return "";
  return valid
    .map(
      (note) => `
    <section class="section section--keep">
      <div class="section-title">${escapeHtml(note.title)}</div>
      <div class="note-box pre-wrap">${escapeHtml(note.body)}</div>
    </section>`,
    )
    .join("");
}

function renderPaymentSection(
  payment: PrintableBookingSheet["paymentSummary"],
): string {
  const rowsHtml = payment.lines
    .map((line) => {
      const classes = [
        line.highlight ? "highlight-row" : "",
        line.dividerAbove ? "divider-above" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `
        <tr${classes ? ` class="${classes}"` : ""}>
          <td>${escapeHtml(line.label)}</td>
          <td class="num">${escapeHtml(line.amount)}</td>
        </tr>`;
    })
    .join("");

  const detailsHtml =
    payment.details && payment.details.length > 0
      ? `<div class="payment-notes">
          ${payment.details.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        </div>`
      : "";

  const footnoteHtml = payment.footnote
    ? `<div class="footnote">${escapeHtml(payment.footnote)}</div>`
    : "";

  return `
    <section class="section section--keep">
      <div class="section-title">${escapeHtml(payment.heading ?? "Payment & Earnings Summary")}</div>
      <table class="summary-table">
        <tbody>${rowsHtml}</tbody>
      </table>
      ${detailsHtml}
      ${footnoteHtml}
    </section>`;
}

function renderTimelineSection(timeline: PrintableTimelineEntry[]): string {
  if (timeline.length === 0) return "";
  return `
    <section class="section">
      <div class="section-title">Booking Updates</div>
      <table class="line-table">
        <thead>
          <tr>
            <th>Update</th>
            <th>Date &amp; Time</th>
          </tr>
        </thead>
        <tbody>
          ${timeline
            .map(
              (entry) => `
            <tr>
              <td>
                <strong>${escapeHtml(entry.title)}</strong>${
                  entry.description
                    ? `<div class="muted">${escapeHtml(entry.description)}</div>`
                    : ""
                }
              </td>
              <td class="nowrap">${escapeHtml(entry.timestamp)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </section>`;
}

export function buildPrintableBookingSheetHtml(
  sheet: PrintableBookingSheet,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(sheet.fileTitle)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #123b30;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.42;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .sheet {
      width: 100%;
      padding: 13mm 15mm 14mm;
    }

    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 10px;
      border-bottom: 2px solid #093b26;
      margin-bottom: 12px;
    }

    .brand-block {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .brand-bar {
      width: 6px;
      height: 36px;
      background: #093b26;
      border-radius: 2px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .brand-name {
      font-size: 13pt;
      font-weight: 800;
      letter-spacing: 0.14em;
      color: #093b26;
      line-height: 1.1;
    }

    .doc-subtitle {
      font-size: 8.5pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #374151;
      margin-top: 3px;
    }

    .doc-meta {
      text-align: right;
      font-size: 8.5pt;
      line-height: 1.5;
    }

    .doc-meta strong {
      color: #093b26;
    }

    .status-tag {
      display: inline-block;
      padding: 1px 7px;
      border: 1px solid #093b26;
      border-radius: 3px;
      font-size: 8pt;
      font-weight: 700;
      color: #093b26;
      background: #e8f1ee;
    }

    .two-col {
      display: grid;
      grid-template-columns: 1.25fr 1fr;
      border: 1px solid #cfd6d4;
      margin-bottom: 12px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .two-col > .col {
      padding: 9px 11px;
    }

    .two-col > .col + .col {
      border-left: 1px solid #cfd6d4;
    }

    .section {
      border: 1px solid #cfd6d4;
      padding: 9px 11px;
      margin-bottom: 11px;
    }

    .section--keep {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .section-title {
      font-size: 7.5pt;
      font-weight: 800;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: #093b26;
      padding-bottom: 5px;
      margin-bottom: 7px;
      border-bottom: 1px solid #e5e9e8;
      break-after: avoid;
      page-break-after: avoid;
    }

    .kv-table {
      width: 100%;
      border-collapse: collapse;
    }

    .kv-table th,
    .kv-table td {
      padding: 2.5px 0;
      vertical-align: top;
      text-align: left;
      font-size: 9pt;
    }

    .kv-table th {
      width: 84px;
      font-weight: 600;
      color: #4b5563;
      padding-right: 8px;
      white-space: nowrap;
    }

    .kv-table td {
      font-weight: 600;
      color: #123b30;
      word-break: break-word;
    }

    .package-header {
      margin-bottom: 6px;
    }

    .package-name {
      font-size: 11pt;
      font-weight: 700;
      color: #123b30;
    }

    .package-meta {
      font-size: 8.5pt;
      color: #4b5563;
      margin-top: 2px;
    }

    .sub-block {
      margin-top: 8px;
      padding-top: 7px;
      border-top: 1px dashed #d9dedc;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .sub-label {
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #374151;
      margin-bottom: 4px;
    }

    .sub-value {
      font-size: 9pt;
    }

    .dish-group-list {
      margin: 0;
      padding-left: 16px;
      font-size: 9pt;
    }

    .dish-group-list li {
      margin-bottom: 2px;
    }

    .inclusion-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 3px 14px;
      margin: 0;
      padding-left: 15px;
      font-size: 8.5pt;
    }

    .inclusion-grid li {
      break-inside: avoid;
      word-break: break-word;
    }

    .line-table,
    .summary-table {
      width: 100%;
      border-collapse: collapse;
    }

    .line-table th {
      text-align: left;
      font-size: 8pt;
      font-weight: 700;
      color: #4b5563;
      border-bottom: 1px solid #d9dedc;
      padding: 4px 6px 4px 0;
    }

    .line-table td {
      padding: 5px 6px 5px 0;
      border-bottom: 1px solid #eef1f0;
      vertical-align: top;
      font-size: 8.8pt;
    }

    .line-table tr:last-child td {
      border-bottom: 0;
    }

    .summary-table td {
      padding: 3.5px 0;
      font-size: 9pt;
    }

    .summary-table tr.divider-above td {
      padding-top: 7px;
      border-top: 1px solid #d9dedc;
    }

    .summary-table tr.highlight-row td {
      background: #e8f1ee;
      color: #093b26;
      font-weight: 800;
      font-size: 10.5pt;
      padding: 6px 8px;
      border-top: 1px solid #093b26;
      border-bottom: 1px solid #093b26;
    }

    .num {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }

    .nowrap {
      white-space: nowrap;
    }

    .note-box {
      background: #f7f8f8;
      border-left: 3px solid #093b26;
      padding: 7px 10px;
      font-size: 9pt;
      color: #1f2937;
    }

    .payment-notes {
      margin-top: 7px;
      padding-top: 6px;
      border-top: 1px solid #e5e9e8;
      font-size: 8.3pt;
      color: #374151;
    }

    .payment-notes p {
      margin: 0 0 3px;
    }

    .payment-notes p:last-child {
      margin-bottom: 0;
    }

    .muted {
      color: #4b5563;
      font-size: 8.3pt;
    }

    .footnote {
      margin-top: 6px;
      font-size: 7.8pt;
      color: #6b7280;
    }

    .pre-wrap {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .doc-footer {
      margin-top: 12px;
      padding-top: 7px;
      border-top: 1px solid #cfd6d4;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7.8pt;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <main class="sheet">
    <header class="doc-header">
      <div class="brand-block">
        <div class="brand-bar" aria-hidden="true"></div>
        <div>
          <div class="brand-name">FEASTA</div>
          <div class="doc-subtitle">${escapeHtml(sheet.documentTitle)}</div>
        </div>
      </div>
      <div class="doc-meta">
        <div>Ref: <strong>${escapeHtml(sheet.reference)}</strong></div>
        <div>Status: <span class="status-tag">${escapeHtml(sheet.status)}</span></div>
        ${sheet.submittedAt ? `<div>Submitted: ${escapeHtml(sheet.submittedAt)}</div>` : ""}
      </div>
    </header>

    <div class="two-col">
      <div class="col">
        <div class="section-title">Event Details</div>
        <table class="kv-table">
          <tbody>${renderKeyValueRows(sheet.eventDetails)}</tbody>
        </table>
      </div>
      <div class="col">
        <div class="section-title">Customer Information</div>
        <table class="kv-table">
          <tbody>${renderKeyValueRows(sheet.customerDetails)}</tbody>
        </table>
      </div>
    </div>

    ${sheet.packageSummary ? renderPackageSection(sheet.packageSummary) : ""}
    ${sheet.services && sheet.services.length > 0 ? renderServicesSection(sheet.services) : ""}
    ${sheet.notes && sheet.notes.length > 0 ? renderNotesSection(sheet.notes) : ""}
    ${renderPaymentSection(sheet.paymentSummary)}
    ${sheet.timeline && sheet.timeline.length > 0 ? renderTimelineSection(sheet.timeline) : ""}

    <footer class="doc-footer">
      <span>${escapeHtml(sheet.footerText)}</span>
      <span>Printed from FEASTA Provider Portal</span>
    </footer>
  </main>
</body>
</html>`;
}

const PRINT_FRAME_ATTR = "data-feasta-print-frame";

/**
 * Prints a standalone A4 booking sheet inside an isolated hidden iframe so
 * neither the FEASTA web chrome nor browser URL headers leak onto paper.
 */
export function printBookingSheet(sheet: PrintableBookingSheet): void {
  if (typeof document === "undefined") return;

  for (const existing of document.querySelectorAll(`iframe[${PRINT_FRAME_ATTR}]`)) {
    existing.remove();
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute(PRINT_FRAME_ATTR, "true");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";

  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDoc = frameWindow?.document;
  if (!frameWindow || !frameDoc) {
    iframe.remove();
    return;
  }

  const html = buildPrintableBookingSheetHtml(sheet);
  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  const cleanup = () => {
    iframe.remove();
  };

  frameWindow.addEventListener("afterprint", cleanup, {once: true});
  frameWindow.focus();
  frameWindow.print();
}
