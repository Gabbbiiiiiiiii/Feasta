function textAlternative(element: Element, root: HTMLElement) {
  const ariaLabel = element.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const value = labelledBy.split(/\s+/).map((id) => root.ownerDocument.getElementById(id)?.textContent ?? "").join(" ").trim();
    if (value) return value;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const labels = Array.from(element.labels ?? []).map((label) => label.textContent ?? "").join(" ").trim();
    if (labels) return labels;
  }
  return element.textContent?.trim() ?? "";
}

function runBasicAccessibilityAudit(root: HTMLElement) {
  const failures: string[] = [];
  const h1s = root.querySelectorAll("h1");
  if (h1s.length !== 1) failures.push(`Expected one h1, found ${h1s.length}.`);
  if (root.querySelectorAll("main").length !== 1) failures.push("Expected one main landmark.");

  root.querySelectorAll("button, a[href], input:not([type='hidden']), select, textarea").forEach((control) => {
    if (!textAlternative(control, root)) failures.push(`${control.tagName.toLowerCase()} has no accessible name.`);
  });
  root.querySelectorAll("img").forEach((image) => {
    if (!image.hasAttribute("alt")) failures.push("img is missing alt text.");
  });
  root.querySelectorAll("[role='img']").forEach((image) => {
    if (!textAlternative(image, root)) failures.push("role=img has no accessible name.");
  });

  const headingLevels = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((heading) => Number(heading.tagName.slice(1)));
  headingLevels.slice(1).forEach((level, index) => {
    if (level > headingLevels[index] + 1) failures.push(`Heading level jumps from h${headingLevels[index]} to h${level}.`);
  });
  return failures;
}

export {runBasicAccessibilityAudit};
