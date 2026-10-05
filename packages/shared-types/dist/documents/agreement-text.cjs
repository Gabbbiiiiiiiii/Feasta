"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgreementTextValidationError = void 0;
exports.validateAgreementSections = validateAgreementSections;
exports.agreementSectionsToText = agreementSectionsToText;
exports.parseAgreementText = parseAgreementText;
class AgreementTextValidationError extends Error {
}
exports.AgreementTextValidationError = AgreementTextValidationError;
const MAX_SECTIONS = 40;
const MAX_PARAGRAPHS = 12;
const MAX_PARAGRAPH_LENGTH = 2000;
function validateAgreementSections(value) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new AgreementTextValidationError("Enter agreement text.");
    }
    if (value.length > MAX_SECTIONS) {
        throw new AgreementTextValidationError("The agreement contains more than 40 sections. Combine related sections before saving.");
    }
    return value.map((entry) => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            throw new AgreementTextValidationError("Each agreement section needs a heading and paragraphs.");
        }
        const section = entry;
        if (typeof section.title !== "string" || section.title.trim().length < 2 || section.title.trim().length > 160) {
            throw new AgreementTextValidationError("Each section heading must be between 2 and 160 characters.");
        }
        const title = section.title.trim();
        if (!Array.isArray(section.paragraphs) || section.paragraphs.length === 0) {
            throw new AgreementTextValidationError(`Add agreement text under "${title}".`);
        }
        if (section.paragraphs.length > MAX_PARAGRAPHS) {
            throw new AgreementTextValidationError(`Section "${title}" exceeds the 12-paragraph capacity. Divide it into related sections before saving.`);
        }
        const paragraphs = section.paragraphs.map((paragraph) => {
            if (typeof paragraph !== "string" || !paragraph.trim()) {
                throw new AgreementTextValidationError(`Enter non-empty paragraphs under "${title}".`);
            }
            if (paragraph.trim().length > MAX_PARAGRAPH_LENGTH) {
                throw new AgreementTextValidationError(`Each paragraph under "${title}" must contain 2000 characters or fewer.`);
            }
            return paragraph.trim();
        });
        return { title, paragraphs };
    });
}
function agreementSectionsToText(sections) {
    return sections.map((section) => `# ${section.title}\n\n${section.paragraphs.join("\n\n")}`).join("\n\n");
}
function parseAgreementText(rawText) {
    const text = rawText.replace(/\r\n?/gu, "\n")
        .split("\n").map((line) => line.trimEnd()).join("\n").trim();
    if (!text)
        throw new AgreementTextValidationError("Enter agreement text.");
    const lines = text.split("\n");
    const listLines = new Set();
    let previousNumberedLine = -1;
    for (const [index, line] of lines.entries()) {
        if (!line.trim())
            continue;
        if (/^\d+[.)]\s+\S/u.test(line.trim())) {
            if (previousNumberedLine >= 0) {
                listLines.add(previousNumberedLine);
                listLines.add(index);
            }
            previousNumberedLine = index;
        }
        else
            previousNumberedLine = -1;
    }
    const headings = new Map();
    let hasBody = false;
    for (let index = lines.length - 1; index >= 0; index--) {
        const title = listLines.has(index) ? null : headingTitle(lines[index].trim());
        // Ambiguous standalone titles without a body remain content. This also
        // keeps the fallback stable when its canonical text is opened and saved.
        if (title !== null && hasBody) {
            headings.set(index, title);
            hasBody = false;
        }
        else if (lines[index].trim())
            hasBody = true;
    }
    const blocks = [];
    let block = { title: "Agreement", lines: [] };
    for (const [index, line] of lines.entries()) {
        const title = headings.get(index);
        if (title !== undefined) {
            if (block.lines.some((entry) => entry.trim()))
                blocks.push(block);
            block = { title, lines: [] };
        }
        else {
            block.lines.push(line);
        }
    }
    blocks.push(block);
    const sections = [];
    for (const entry of blocks) {
        const body = entry.lines.join("\n").trim();
        sections.push({
            title: entry.title,
            paragraphs: body.split(/\n\s*\n/gu).flatMap((paragraph) => splitParagraph(paragraph)),
        });
    }
    // Keep readable newlines, but pack small paragraphs if pasted blank lines
    // alone would exceed the existing storage count. Never exceed either limit.
    for (const section of sections) {
        if (section.paragraphs.length <= MAX_PARAGRAPHS)
            continue;
        const packed = [];
        for (const paragraph of section.paragraphs) {
            const last = packed.length - 1;
            if (last >= 0 && packed[last].length + 2 + paragraph.length <= MAX_PARAGRAPH_LENGTH) {
                packed[last] += `\n\n${paragraph}`;
            }
            else
                packed.push(paragraph);
        }
        // Preferred paragraph/sentence boundaries can underfill all 12 slots.
        // Reflow at word boundaries before declaring a genuine capacity error.
        section.paragraphs = packed.length <= MAX_PARAGRAPHS ? packed :
            splitParagraph(section.paragraphs.join("\n\n"), false);
    }
    const validated = validateAgreementSections(sections);
    return { normalizedText: agreementSectionsToText(validated), sections: validated };
}
function headingTitle(line) {
    const markdown = /^#{1,6}\s+(.+)$/u.exec(line);
    if (markdown)
        return markdown[1].trim();
    if (/^SECTION\s+\d+(?:\.\d+)*(?:\s*[-–—:.]\s*|\s+)\S/iu.test(line))
        return line;
    if (/^(?:Before You Continue|Provider Acknowledgment|Provider Acknowledgement|Electronic Acceptance)$/iu.test(line))
        return line;
    const numbered = /^\d+(?:\.\d+)*[.)]?\s+(.+)$/u.exec(line);
    // Uppercase, short, non-sentence titles only. Ordinary numbered legal
    // statements (including the acknowledgement list) remain content.
    if (numbered && line.length <= 160 && /\p{L}/u.test(numbered[1]) &&
        numbered[1] === numbered[1].toUpperCase() && !/[.!?;:]$/u.test(line))
        return line;
    return null;
}
function splitParagraph(value, preferBoundaries = true) {
    let remaining = value.trim();
    const result = [];
    while (remaining.length > MAX_PARAGRAPH_LENGTH) {
        const window = remaining.slice(0, MAX_PARAGRAPH_LENGTH + 1);
        let boundary = preferBoundaries ? lastBoundary(window, /\n(?=\s*(?:[-*•▪◦]|\d+[.)])\s)/gu) : -1;
        if (preferBoundaries && boundary < 1)
            boundary = lastBoundary(window, /[.!?]["'”’\])]*\s+/gu, true);
        if (boundary < 1)
            boundary = lastBoundary(window, /\s+/gu);
        if (boundary < 1) {
            boundary = MAX_PARAGRAPH_LENGTH;
            // Only an unbroken token forces a mid-word split. Preserve surrogate pairs.
            if (/[\uD800-\uDBFF]/u.test(remaining[boundary - 1]))
                boundary--;
        }
        result.push(remaining.slice(0, boundary).trim());
        remaining = remaining.slice(boundary).trim();
    }
    if (remaining)
        result.push(remaining);
    return result;
}
function lastBoundary(text, pattern, afterPunctuation = false) {
    let boundary = -1;
    for (const match of text.matchAll(pattern)) {
        const candidate = match.index + (afterPunctuation ? match[0].trimEnd().length : 0);
        if (candidate <= MAX_PARAGRAPH_LENGTH)
            boundary = candidate;
    }
    return boundary;
}
//# sourceMappingURL=agreement-text.cjs.map