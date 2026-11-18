export function walkInInputError(name: string, value: string, now = Date.now()): string {
  const text = value.trim();
  if (!text) return "";
  switch (name) {
    case "full name":
    case "event type":
    case "custom event type":
    case "custom service":
      return /\p{L}/u.test(text) ? "" : "Enter a name that includes letters.";
    case "contact number": {
      const digits = text.replace(/\D/g, "");
      return /^\+?[\d(). -]+$/.test(text) && /^\d{7,15}$/.test(digits) && !/^(\d)\1+$/.test(digits)
        ? "" : "Enter a valid contact number with 7 to 15 digits.";
    }
    case "number of guests":
      return /^\d{1,6}$/.test(text) && Number(text) >= 1 && Number(text) <= 100000
        ? "" : "Enter a whole number from 1 to 100,000.";
    case "agreed price":
      return /^\d{1,9}(\.\d{1,2})?$/.test(text)
        ? "" : "Enter a peso amount up to ₱999,999,999.99 with at most two decimal places.";
    case "event date": {
      const today = new Date(now + 8 * 3600000);
      const earliest = today.toISOString().slice(0, 10);
      const latest = new Date(today.getTime() + 731 * 86400000).toISOString().slice(0, 10);
      return text < earliest || text > latest ? "Choose an event date within the next two years." : "";
    }
    default:
      return "";
  }
}


export function currentWalkInAgreement(now = Date.now()) {
  const local = new Date(now + 8 * 60 * 60 * 1000).toISOString();
  return {date: local.slice(0, 10), time: local.slice(11, 16)};
}
