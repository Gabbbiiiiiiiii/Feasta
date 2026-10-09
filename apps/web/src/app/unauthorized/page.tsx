export default function UnauthorizedPage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl place-content-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-black">You do not have access</h1>
      <p className="text-muted-foreground">Sign in with an account that has permission to view this page.</p>
      <a className="mx-auto inline-flex min-h-12 items-center rounded-lg px-4 font-bold text-primary-strong underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/login">
        Return to sign in
      </a>
    </main>
  );
}
