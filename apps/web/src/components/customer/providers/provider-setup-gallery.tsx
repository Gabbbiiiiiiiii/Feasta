import {ImageGallery} from "@/components/customer/discovery/image-gallery";
import {
  PROVIDER_SETUP_EVENT_TYPE_LABELS,
  type ProviderSetup,
} from "@/lib/provider/provider-setup-gallery";

export function ProviderSetupGallery({setups}: {setups: readonly ProviderSetup[]}) {
  if (setups.length === 0) return null;
  return <section aria-labelledby="provider-setup-gallery" className="rounded-[24px] border border-feasta-border-soft bg-card p-5 sm:p-6">
    <div className="max-w-3xl">
      <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">Visual inspiration</p>
      <h2 id="provider-setup-gallery" className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground">Previous event setups</h2>
      <p className="mt-2 text-sm leading-6 text-feasta-text-secondary">Photos of completed events from this provider. A setup is inspiration only and is not a price quote.</p>
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      {setups.map((setup) => <article key={setup.id} id={`provider-setup-${setup.id}`} className="min-w-0 rounded-[20px] border border-feasta-border-soft bg-white p-4 sm:p-5">
        <h3 className="break-words text-lg font-extrabold text-foreground">{setup.title}</h3>
        <p className="mt-1 text-sm font-semibold text-primary-strong">{PROVIDER_SETUP_EVENT_TYPE_LABELS[setup.eventType]}</p>
        {setup.themeTags.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">
          {setup.themeTags.map((tag) => <span key={tag} className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary-strong">{tag}</span>)}
        </div> : null}
        {setup.description ? <p className="mt-3 text-sm leading-6 text-feasta-text-secondary">{setup.description}</p> : null}
        <div className="mt-4">
          {setup.imageUrls.length > 0 ? <ImageGallery label={`${setup.title} setup photos`} images={setup.imageUrls.map((url, index) => ({url, title: `${setup.title} photo ${index + 1}`}))} />
            : <p className="rounded-xl border border-dashed border-feasta-border-strong px-4 py-6 text-sm text-feasta-text-secondary">No setup photos available.</p>}
        </div>
        <p className="mt-3 text-xs leading-5 text-feasta-text-secondary">Inspiration only. Furniture, styling, and service details follow the package you book.</p>
      </article>)}
    </div>
  </section>;
}
