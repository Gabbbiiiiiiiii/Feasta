"use client";

import {Heart} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useState, useTransition} from "react";

import {setProviderFavoriteAction} from "@/app/customer/favorites/actions";
import {feastaToast} from "@/components/feedback/toast";
import {
  isPublicProviderMarketplaceReturnPath,
} from "@/lib/customer/providers/provider-route-policy";
import {providerProfileHref} from "@/lib/customer/providers/provider-query";
import {cn} from "@/lib/utils";

export function ProviderFavoriteControl({
  providerId,
  providerName,
  initialFavorited,
  authenticated,
  loginReturnTo,
  showLabel = false,
  className,
}: {
  providerId: string;
  providerName: string;
  initialFavorited: boolean;
  authenticated: boolean;
  loginReturnTo: string;
  showLabel?: boolean;
  className?: string;
}) {
  if (!authenticated) {
    const safeReturnTo = isPublicProviderMarketplaceReturnPath(loginReturnTo)
      ? loginReturnTo
      : providerProfileHref(providerId);
    return (
      <Link
        href={`/login?next=${encodeURIComponent(safeReturnTo)}`}
        aria-label={`Add ${providerName} to favorites. Log in required.`}
        className={favoriteControlClassName(false, className)}
      >
        <Heart aria-hidden="true" className="size-5" />
        {showLabel ? <span>Save provider</span> : null}
      </Link>
    );
  }

  return (
    <AuthenticatedFavoriteControl
      providerId={providerId}
      providerName={providerName}
      initialFavorited={initialFavorited}
      showLabel={showLabel}
      className={className}
    />
  );
}

function AuthenticatedFavoriteControl({
  providerId,
  providerName,
  initialFavorited,
  showLabel,
  className,
}: {
  providerId: string;
  providerName: string;
  initialFavorited: boolean;
  showLabel: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, startTransition] = useTransition();

  const label = favorited
    ? `Remove ${providerName} from favorites`
    : `Add ${providerName} to favorites`;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={favorited}
      aria-busy={pending || undefined}
      disabled={pending}
      className={favoriteControlClassName(favorited, className)}
      onClick={() => {
        if (pending) return;
        const nextFavorited = !favorited;
        setFavorited(nextFavorited);
        startTransition(async () => {
          try {
            const result = await setProviderFavoriteAction({
              providerId,
              favorite: nextFavorited,
            });
            setFavorited(result.favorited);
            feastaToast.success(
              result.favorited
                ? `${providerName} was added to your favorites.`
                : `${providerName} was removed from your favorites.`,
            );
            router.refresh();
          } catch {
            setFavorited(!nextFavorited);
            feastaToast.error(
              "Your favorites could not be updated. Please try again.",
            );
          }
        });
      }}
    >
      <Heart
        aria-hidden="true"
        className={cn("size-5", favorited && "fill-current")}
      />
      {showLabel ? (
        <span>{favorited ? "Remove from favorites" : "Save provider"}</span>
      ) : null}
    </button>
  );
}

function favoriteControlClassName(
  favorited: boolean,
  className?: string,
): string {
  return cn(
    "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border bg-white/95 px-3 text-sm font-bold shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70",
    favorited
      ? "border-primary-strong text-primary-strong hover:bg-secondary"
      : "border-border text-foreground hover:border-primary-strong hover:text-primary-strong",
    className,
  );
}
