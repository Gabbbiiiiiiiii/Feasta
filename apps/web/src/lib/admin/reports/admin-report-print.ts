import type {PrintableReportSpec} from "@/lib/admin/reports/admin-report-modules-types";

export function buildPrintableReportHtml(spec: PrintableReportSpec): string {
  const generatedLabel = formatGeneratedTimestamp(spec.generatedAt);
  const summaryCells = spec.summary
    .map(
      (item) =>
        `<div class="summary-item"><div class="summary-label">${escapeHtml(item.label)}</div><div class="summary-value">${escapeHtml(item.value)}</div></div>`,
    )
    .join("");

  const headerCells = spec.columns
    .map(
      (column) =>
        `<th scope="col" class="${column.align === "right" ? "num" : ""}">${escapeHtml(column.header)}</th>`,
    )
    .join("");

  const bodyRows =
    spec.rows.length === 0
      ? `<tr><td colspan="${spec.columns.length}" class="empty">No records match the selected report filters.</td></tr>`
      : spec.rows
          .map((row) => {
            const cells = spec.columns
              .map(
                (column) =>
                  `<td class="${column.align === "right" ? "num" : ""}">${escapeHtml(row[column.key] || "—")}</td>`,
              )
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(spec.title)} — FEASTA</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #1c2421;
      background: #ffffff;
      font-size: 9.5pt;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .brand-bar {
      height: 4px;
      background: #087159;
      margin-bottom: 12px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 12px;
    }
    .brand {
      font-size: 9pt;
      font-weight: 800;
      letter-spacing: 0.12em;
      color: #087159;
      margin: 0 0 2px;
    }
    h1 {
      font-size: 16pt;
      font-weight: 800;
      color: #044234;
      margin: 0 0 4px;
    }
    .meta {
      font-size: 8.5pt;
      color: #5b6b66;
      margin: 0;
    }
    .generated {
      text-align: right;
      font-size: 8.5pt;
      color: #5b6b66;
      white-space: nowrap;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(${Math.max(1, spec.summary.length)}, minmax(0, 1fr));
      border: 1px solid #d5dedb;
      background: #f6faf8;
      margin-bottom: 14px;
    }
    .summary-item {
      padding: 8px 10px;
      border-right: 1px solid #d5dedb;
    }
    .summary-item:last-child { border-right: none; }
    .summary-label {
      font-size: 7.5pt;
      font-weight: 600;
      color: #5b6b66;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .summary-value {
      font-size: 11pt;
      font-weight: 800;
      color: #044234;
      margin-top: 2px;
      font-variant-numeric: tabular-nums;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
    }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th {
      background: #edf7f4;
      color: #044234;
      font-weight: 700;
      text-align: left;
      padding: 7px 8px;
      border: 1px solid #d5dedb;
      white-space: nowrap;
    }
    td {
      padding: 6px 8px;
      border: 1px solid #e2e8e6;
      vertical-align: top;
      word-break: break-word;
    }
    tbody tr:nth-child(even) { background: #fafcfb; }
    .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .empty {
      text-align: center;
      color: #5b6b66;
      padding: 16px;
    }
    .footer {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px solid #d5dedb;
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      color: #5b6b66;
    }
  </style>
</head>
<body>
  <div class="brand-bar"></div>
  <header class="header">
    <div>
      <p class="brand">FEASTA</p>
      <h1>${escapeHtml(spec.title)}</h1>
      <p class="meta">Period: ${escapeHtml(spec.periodLabel)} &nbsp;|&nbsp; ${escapeHtml(spec.filterSummary)}</p>
    </div>
    <div class="generated">
      <div>Generated: ${escapeHtml(generatedLabel)}</div>
      <div>Time zone: Asia/Manila &nbsp;|&nbsp; Currency: PHP</div>
    </div>
  </header>
  <section class="summary">${summaryCells}</section>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <footer class="footer">
    <span>FEASTA Administration Report — Confidential</span>
    <span>Total records: ${spec.rows.length.toLocaleString("en-PH")}</span>
  </footer>
</body>
</html>`;
}

export function printSubModuleReport(spec: PrintableReportSpec): void {
  const html = buildPrintableReportHtml(spec);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
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
    throw new Error("Print preview could not be prepared in this browser.");
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 500);
  };

  frameWindow.addEventListener("afterprint", cleanup, {once: true});
  frameWindow.focus();
  frameWindow.print();
  // Fallback cleanup if the browser does not fire afterprint.
  window.setTimeout(() => {
    if (iframe.parentNode) {
      iframe.remove();
    }
  }, 60_000);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
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
