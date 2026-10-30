const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/u;

const philippineDateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});

function formatPhilippineDate(value: string): string {
  const trimmed = value.trim();
  const match = DATE_ONLY.exec(trimmed);
  const date = match
    ? new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00+08:00`)
    : new Date(trimmed);

  if (Number.isNaN(date.getTime())) return value;

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utc = new Date(Date.UTC(year, month - 1, day));

    if (
      utc.getUTCFullYear() !== year ||
      utc.getUTCMonth() !== month - 1 ||
      utc.getUTCDate() !== day
    ) {
      return value;
    }
  }

  return philippineDateFormatter.format(date);
}

export {formatPhilippineDate};
