const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/u;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const philippineDateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});

function isValidPhilippineDateKey(value: string): boolean {
  const match = DATE_ONLY.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

function todayPhilippineDateKey(now = new Date()): string {
  const manila = new Date(now.getTime() + MANILA_OFFSET_MS);
  const year = manila.getUTCFullYear();
  const month = String(manila.getUTCMonth() + 1).padStart(2, "0");
  const day = String(manila.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPhilippineDate(value: string): string {
  const trimmed = value.trim();
  const match = DATE_ONLY.exec(trimmed);
  const date = match
    ? new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00+08:00`)
    : new Date(trimmed);

  if (Number.isNaN(date.getTime())) return value;

  if (match && !isValidPhilippineDateKey(trimmed)) {
    return value;
  }

  return philippineDateFormatter.format(date);
}

export {
  formatPhilippineDate,
  isValidPhilippineDateKey,
  todayPhilippineDateKey,
};
