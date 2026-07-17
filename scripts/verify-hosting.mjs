const baseUrl = process.env.PHASE3_HOSTING_URL ?? "http://127.0.0.1:55000";
const page = await fetch(baseUrl);
if (!page.ok || !(await page.text()).includes("FEASTA Hosting Emulator")) {
  throw new Error("Hosting Emulator did not serve the validation page.");
}

const health = await fetch(`${baseUrl}/api/health`);
if (!health.ok) {
  throw new Error(`Hosting health rewrite failed with ${health.status}.`);
}
const healthBody = await health.json();
if (healthBody.status !== "ok" || healthBody.service !== "feasta-functions") {
  throw new Error("Hosting health rewrite returned an invalid response.");
}

console.log("Hosting static page and Functions rewrite verified.");
