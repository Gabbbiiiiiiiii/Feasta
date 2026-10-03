"use client";

import {useEffect, useId, useRef, useState} from "react";

export function ExpandablePackageDescription({
  description,
}: {
  description: string;
}) {
  const descriptionId = useId();
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    if (expanded) return undefined;

    const paragraph = paragraphRef.current;
    if (!paragraph) return undefined;

    const measure = () => {
      setCanExpand(paragraph.scrollHeight > paragraph.clientHeight + 1);
    };

    measure();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measure);
    observer?.observe(paragraph);
    window.addEventListener("resize", measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [description, expanded]);

  return (
    <div className="mt-5 max-w-3xl min-w-0">
      <p
        id={descriptionId}
        ref={paragraphRef}
        className={[
          "whitespace-pre-line break-words text-sm leading-7 text-feasta-text-secondary sm:text-base",
          expanded ? "" : "line-clamp-3",
        ].join(" ")}
      >
        {description}
      </p>

      {canExpand || expanded ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={descriptionId}
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 inline-flex min-h-9 items-center rounded-lg text-sm font-bold text-primary-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {expanded ? "Show Less" : "Read More"}
        </button>
      ) : null}
    </div>
  );
}
