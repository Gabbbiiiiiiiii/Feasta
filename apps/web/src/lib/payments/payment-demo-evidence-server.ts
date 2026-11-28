import "server-only";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {parsePaymentDemoEvidence} from "./payment-demo-evidence";

/** Optional local demonstration evidence. Missing receipts never become a claimed gateway success. */
export async function readPaymentDemoEvidence() {
  for (const root of [process.cwd(), resolve(process.cwd(), "../..")]) {
    try {
      const raw = await readFile(resolve(root, ".local/paymongo-payout-demo/capstone-demo-01.json"), "utf8");
      if (raw.length > 24000) continue;
      const evidence = parsePaymentDemoEvidence(JSON.parse(raw));
      if (evidence) return evidence;
    } catch { /* Optional local receipt; no credentials, raw data or file paths are exposed. */ }
  }
  return null;
}
