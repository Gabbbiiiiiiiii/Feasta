import {
  ImageGallery,
} from "@/components/customer/discovery/image-gallery";
import type {
  ProviderSetup,
} from "@/lib/provider/provider-setup-gallery";

export function ProviderSetupGallery({
  setups,
}: {
  setups:
    readonly ProviderSetup[];
}) {
  if (setups.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="provider-previous-setups"
      className="rounded-[24px] border border-feasta-border-soft bg-card p-5 sm:p-6"
    >
      <div className="max-w-3xl">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
          Real provider work
        </p>

        <h2
          id="provider-previous-setups"
          className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground"
        >
          Previous Event Setups
        </h2>

        <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">
          Browse actual event setups from this provider. You&apos;ll be able to use one as inspiration when customizing an eligible catering package.
        </p>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {setups.map(
          (setup) => (
            <article
              key={setup.id}
              id={`provider-setup-${setup.id}`}
              className="min-w-0 rounded-[20px] border border-feasta-border-soft bg-white p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-lg font-extrabold text-foreground">
                    {setup.title}
                  </h3>

                  <p className="mt-1 text-sm font-semibold text-primary-strong">
                    {formatEventType(
                      setup.eventType,
                    )}
                  </p>
                </div>
              </div>

              {setup.themeTags.length >
              0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {setup.themeTags.map(
                    (tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary-strong"
                      >
                        {tag}
                      </span>
                    ),
                  )}
                </div>
              ) : null}

              {setup.description ? (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-feasta-text-secondary">
                  {
                    setup.description
                  }
                </p>
              ) : null}

              <div className="mt-4">
                <ImageGallery
                  label={`${setup.title} setup photos`}
                  images={
                    setup.imageUrls.map(
                      (
                        url,
                        index,
                      ) => ({
                        url,

                        title:
                          `${setup.title} photo ${index + 1}`,
                      }),
                    )
                  }
                />
              </div>

              <p className="mt-3 text-xs leading-5 text-feasta-text-secondary">
                Inspiration only. Exact styling, furniture, decorations, staffing, and upgrades depend on the package and services selected for your booking.
              </p>
            </article>
          ),
        )}
      </div>
    </section>
  );
}

function formatEventType(
  value: string,
): string {
  return value
    .replace(
      /_/gu,
      " ",
    )
    .replace(
      /\b\w/gu,
      (character) =>
        character.toUpperCase(),
    );
}