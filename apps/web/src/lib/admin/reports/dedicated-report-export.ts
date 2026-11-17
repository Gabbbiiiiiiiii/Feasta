import type {DedicatedReport} from "./dedicated-report-types";

function metadata(report: DedicatedReport, device: string) {
  const stamp = (value: string) => new Date(value).toLocaleString("en-PH", {timeZone: "Asia/Manila"}) + " (Philippine Standard Time, UTC+08:00)";
  return [
    ["Report generated", stamp(report.generatedAt)],
    ["PDF exported", stamp(new Date().toISOString())],
    ["Administrator", report.generatedBy],
    ["Browser-reported session metadata", device],
    ["Filters", report.period],
  ];
}

export async function exportDedicatedReport(report: DedicatedReport, format: "pdf", device: string) {
  if (format !== "pdf") throw new Error("Only PDF exports are supported.");
  const {PDFDocument, StandardFonts, rgb} = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setAuthor(report.generatedBy);
  pdf.setTitle(report.title);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([842, 595]);
  let y = 555;
  const safe = (value: string) => [...value].map((letter) => {
    if (letter === "₱") return "PHP ";
    if (letter === "\n" || letter === "\r" || letter === "\t") return " ";
    try {font.encodeText(letter); return letter;} catch {return "?";}
  }).join("");
  function wrap(value: string, width: number, size = 9, strong = false) {
    const lines: string[] = [];
    let current = "";
    const face = strong ? bold : font;
    for (const character of safe(value)) {
      if (current && face.widthOfTextAtSize(current + character, size) > width) {
        lines.push(current); current = character;
      } else current += character;
    }
    lines.push(current);
    return lines;
  }
  function line(value: string, strong = false, size = 9) {
    for (const text of wrap(value, 755, size, strong)) {
      if (y < 45) {page = pdf.addPage([842, 595]); y = 555;}
      page.drawText(text, {x:40,y,size,font:strong?bold:font,color:rgb(0.05,0.15,0.1)});
      y -= size + 6;
    }
  }
  function brand() {
    line("FEASTA | Administrative Reports", true, 14);
    line(report.title, true, 12);
  }
  brand();
  for (const row of metadata(report, device)) line(row.join(": "));
  line(report.note);
  y -= 10;
  const columnWidth = 755 / report.headers.length;
  function tableRow(values: (string | number)[], heading = false) {
    const cells = values.map((value) => wrap(String(value), columnWidth-12, 9, heading));
    const lineCount = Math.max(...cells.map((cell) => cell.length));
    let offset = 0;
    while (offset < lineCount) {
      if (y < 80) {
        page = pdf.addPage([842,595]); y = 555; brand();
        if (!heading) tableRow(report.headers,true);
      }
      const count = Math.min(lineCount-offset, Math.max(1,Math.floor((y-52)/13)));
      const height = count*13+12;
      if (heading) page.drawRectangle({x:40,y:y-height+5,width:755,height,color:rgb(0.91,0.95,0.93)});
      cells.forEach((cell,column) => cell.slice(offset,offset+count).forEach((text,index) => {
        page.drawText(text,{x:46+column*columnWidth,y:y-index*13-4,size:9,font:heading?bold:font});
      }));
      y -= height;
      page.drawLine({start:{x:40,y:y+5},end:{x:795,y:y+5},thickness:0.4,color:rgb(0.8,0.8,0.8)});
      offset += count;
    }
  }
  tableRow(report.headers,true);
  for (const row of report.rows) tableRow(row);
  if (!report.rows.length) line("No matching records.");
  y -= 10;
  for (const total of report.summary || []) line(total,true);
  pdf.getPages().forEach((item,index,array) => item.drawText(`FEASTA | Page ${index+1} of ${array.length}`,{x:685,y:20,size:8,font}));
  const bytes = await pdf.save();
  const blob = new Blob([new Uint8Array(bytes)],{type:"application/pdf"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `feasta-${report.title.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${report.generatedAt.slice(0,10)}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
