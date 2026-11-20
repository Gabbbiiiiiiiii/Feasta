export function clearBestFitSession(customerId: string) {
  try {
    sessionStorage.removeItem(`feasta:best-fit:latest:${customerId}`);
    sessionStorage.removeItem(`feasta:best-fit:availability:${customerId}`);
    const prefix = `feasta:best-fit:choices:[${JSON.stringify(customerId)},`;
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch { /* Storage may be disabled in this tab. */ }
}
