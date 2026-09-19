"use client";

export default function CustomerFavoritesError({
  reset,
}: {
  error: Error & {digest?: string};
  reset: () => void;
}) {
  return (
    <section
      role="alert"
      className="grid min-h-64 place-items-center rounded-card border border-border bg-card px-5 py-10 text-center shadow-card"
    >
      <div className="max-w-md">
        <h1 className="text-2xl font-black">Favorites could not be loaded</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your saved providers are still safe. Please try loading them again.
        </p>
        <button
          type="button"
          className="mt-5 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] bg-primary-strong px-5 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={reset}
        >
          Try again
        </button>
      </div>
    </section>
  );
}
