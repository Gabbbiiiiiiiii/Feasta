import {CircleAlert, Inbox} from "lucide-react";
import type {ReactNode} from "react";

import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";

type StateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
  className?: string;
  live?: "polite" | "assertive";
};

function StateView({title, description, actionLabel, onAction, icon, className, live}: StateProps) {
  return (
    <section
      className={cn("mx-auto grid max-w-xl justify-items-center gap-4 px-6 py-12 text-center", className)}
      aria-live={live}
      aria-label={live ? title : undefined}
      role={live === "assertive" ? "alert" : live === "polite" ? "status" : undefined}
    >
      <div aria-hidden="true" className="text-muted-foreground">{icon}</div>
      <h2 className="break-words text-2xl font-bold">{title}</h2>
      {description ? <p className="break-words text-base text-muted-foreground">{description}</p> : null}
      {actionLabel && onAction ? <Button onClick={onAction}>{actionLabel}</Button> : null}
    </section>
  );
}

function EmptyState(props: StateProps) {
  return <StateView icon={<Inbox className="size-14" />} {...props} />;
}

function ErrorState({actionLabel = "Try again", ...props}: StateProps) {
  return (
    <StateView
      icon={<CircleAlert className="size-14 text-destructive" />}
      actionLabel={props.onAction ? actionLabel : undefined}
      live="assertive"
      {...props}
    />
  );
}

export {EmptyState, ErrorState, type StateProps};
