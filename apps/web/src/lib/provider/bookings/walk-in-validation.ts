export function walkInInputError(name: string, value: string, now = Date.now()): string {
  const text = value.trim();
  if (!text) return "";
  switch (name) {
    case "full name":
      return /^(?:\p{L}\p{M}*)+(?: +(?:\p{L}\p{M}*)+)*$/u.test(text)
        ? "" : "Enter a name using letters only.";
    case "event type":
    case "custom event type":
    case "custom service":
      return /\p{L}/u.test(text) ? "" : "Enter a name that includes letters.";
    case "contact number":
      return /^09\d{9}$/.test(text)
        ? "" : "Enter an 11-digit mobile number starting with 09.";
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
        ? "" : "Please enter a valid email address";
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
