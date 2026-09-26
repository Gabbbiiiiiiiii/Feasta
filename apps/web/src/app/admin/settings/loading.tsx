export default function AdminSettingsLoading() {
  return (
    <div
      aria-label="Loading platform settings"
      className="grid animate-pulse gap-6"
    >
      <div className="grid gap-3">
        <div className="h-4 w-32 rounded bg-skeleton" />
        <div className="h-10 w-72 max-w-full rounded bg-skeleton" />
        <div className="h-5 w-full max-w-xl rounded bg-skeleton" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-6">
          <div className="h-96 rounded-card bg-skeleton" />
          <div className="h-64 rounded-card bg-skeleton" />
        </div>

        <div className="grid content-start gap-4">
          <div className="h-72 rounded-card bg-skeleton" />
          <div className="h-36 rounded-card bg-skeleton" />
        </div>
      </div>
    </div>
  );
}