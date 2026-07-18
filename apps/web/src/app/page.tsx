export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="w-full max-w-3xl rounded-card border border-border bg-card p-10 text-center shadow-card">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary-strong">
          Catering and event booking
        </p>

        <h1 className="mt-4 text-4xl font-bold tracking-tight text-card-foreground sm:text-5xl">
          Welcome to FEASTA
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          Discover providers, compare packages, customize your event, and
          manage bookings from one platform.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a
            href="/providers"
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-pressed"
          >
            Browse providers
          </a>

          <a
            href="/login"
            className="inline-flex min-h-12 items-center justify-center rounded-lg border border-input bg-card px-6 py-3 font-semibold text-card-foreground transition-colors hover:bg-secondary"
          >
            Sign in
          </a>
        </div>
      </section>
    </main>
  );
}
