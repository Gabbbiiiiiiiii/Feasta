import type {ReactNode} from "react";

import {cn} from "@/lib/utils";

type PageHeadingProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
};

function PageHeading({title, description, eyebrow, actions, className}: PageHeadingProps) {
  return (
    <header className={cn("flex min-w-0 flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="mb-2 text-sm font-bold uppercase tracking-widest text-primary-strong">{eyebrow}</p> : null}
        <h1 className="break-words text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl break-words text-base text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex min-w-0 w-full flex-col gap-3 [&>*]:max-w-full sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">{actions}</div> : null}
    </header>
  );
}

export {PageHeading, type PageHeadingProps};
