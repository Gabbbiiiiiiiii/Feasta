export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8F6F3] px-6">
      <section className="w-full max-w-3xl rounded-3xl border border-black/5 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#FF6333]">
          Catering and event booking
        </p>

        <h1 className="mt-4 text-4xl font-bold tracking-tight text-[#2B211D] sm:text-5xl">
          Welcome to FEASTA
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#8C817A] sm:text-lg">
          Discover providers, compare packages, customize your event, and
          manage bookings from one platform.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a
            href="/providers"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#FF6333] px-6 py-3 font-semibold text-white transition hover:bg-[#E9572C]"
          >
            Browse providers
          </a>

          <a
            href="/login"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#E7DED8] px-6 py-3 font-semibold text-[#2B211D] transition hover:bg-[#F8F6F3]"
          >
            Sign in
          </a>
        </div>
      </section>
    </main>
  );
}