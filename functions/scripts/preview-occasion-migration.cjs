/* Offline only: consumes an explicitly supplied JSON inventory; no Firebase SDK. */
const fs = require('node:fs');
const crypto = require('node:crypto');
const canonicalIds = ['birthday', 'wedding', 'debut', 'anniversary', 'reunion',
  'corporate', 'baptism', 'graduation', 'other'];
const normalize = value => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
function contains(value, id) {
  if (value === id) return true;
  if (Array.isArray(value)) return value.some(v => contains(v, id));
  return !!value && typeof value === 'object' && Object.values(value).some(v => contains(v, id));
}
function previewOccasionMigration(input) {
  if (!input || !input.documents || Array.isArray(input.documents) ||
      typeof input.documents !== 'object') throw Error('Expected {documents: {"collection/id": {...}}}.');
  const rows = Object.entries(input.documents).sort(([a], [b]) => a.localeCompare(b));
  if (rows.some(([path, data]) => !path.includes('/') || !data || typeof data !== 'object' || Array.isArray(data))) {
    throw Error('Invalid inventory document.');
  }
  const occasions = rows.filter(([path]) => /^occasions\/[^/]+$/.test(path));
  const names = new Map(), collisions = [], malformed = [], mappings = [];
  for (const [path, data] of occasions) {
    const id = path.split('/')[1];
    if (data.id !== id || !/^[a-z][a-z0-9_]{1,63}$/.test(id) ||
        typeof data.label !== 'string' || !Array.isArray(data.aliases) ||
        data.aliases.some(v => typeof v !== 'string') || data.moderationState !== 'approved' ||
        typeof data.active !== 'boolean' || !Number.isSafeInteger(data.revision) || data.revision < 1 ||
        !Number.isSafeInteger(data.sortOrder) || typeof data.createdBy !== 'string' ||
        !data.createdAt || !data.updatedAt || data.normalizedName !== normalize(data.label)) malformed.push(path);
    const labels = [data.label, ...(Array.isArray(data.aliases) ? data.aliases : [])].filter(v => typeof v === 'string');
    for (const label of labels) {
      const normalizedName = normalize(label), previous = names.get(normalizedName);
      if (previous) collisions.push({normalizedName, first: previous, second: path});
      else names.set(normalizedName, path);
    }
    const codes = data.applicableServiceCategoryCodes;
    const invalidCodes = Array.isArray(codes) ? codes.filter(code => {
      const category = input.documents[`serviceCategories/${code}`];
      return typeof code !== 'string' || !/^[a-z][a-z0-9_]*$/.test(code) ||
        category?.code !== code || category.status !== 'active' ||
        !['catering', 'addon'].includes(category.serviceType);
    }) : [];
    if (!Array.isArray(codes) || !codes.length || invalidCodes.length || new Set(codes).size !== codes.length) {
      mappings.push({occasionId: id, issue: 'Missing, duplicate, or incompatible authoritative category mappings', invalidCodes});
    }
  }
  for (const id of canonicalIds) {
    const holder = names.get(normalize(id));
    if (holder && holder !== `occasions/${id}`) collisions.push({canonicalId: id, conflictingRecord: holder});
  }
  const referenceGroups = {
    packages: path => path.startsWith('packages/'),
    providerEligibility: path => /^(providers|providerEligibilityAuthorities)\//.test(path),
    bookings: path => /^(bookings|mainEvents|providerRequests)\//.test(path),
  };
  const references = Object.fromEntries(Object.entries(referenceGroups).map(([group, match]) => [group,
    canonicalIds.map(id => ({occasionId: id, potentialReferenceCount: rows.filter(([path, data]) =>
      match(path) && (contains(data, id) || (group === 'packages' && data.occasionScope === 'all'))).length}))]));
  const existing = canonicalIds.filter(id => input.documents[`occasions/${id}`]);
  const missing = canonicalIds.filter(id => !input.documents[`occasions/${id}`]);
  const generation = input.documents['occasionCatalog/current'];
  return {mode: 'offline_read_only', inventoryHash: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
    documentCount: rows.length, existing, missing, collisions, malformed, incompatibleMappings: mappings, references,
    catalogStable: generation?.activationState === 'stable' && Number.isSafeInteger(generation.revision) && generation.revision > 0,
    compatibilityIssues: [
      ...missing.map(id => `Missing canonical ID: ${id}; do not infer category mappings or create it automatically.`),
      ...occasions.filter(([path, data]) => data.active && !canonicalIds.includes(path.split('/')[1]))
        .map(([path]) => `Active ID outside historical scalar adapters: ${path}`),
      'Legacy scalar discovery remains primary-only; Web/Mobile compatibility is unverified.',
      'Snapshot completeness, writer coverage, provider grants, withdrawal, and release evidence are unverified.',
      'Potential references include nested supplied documents and universal packages; counts are not release evidence.',
    ], lifecycleAllowed: false, writes: 0};
}
module.exports = {previewOccasionMigration};
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 1) {process.stderr.write('Usage: node scripts/preview-occasion-migration.cjs <inventory.json>\n'); process.exitCode = 1;}
  else {
    try {process.stdout.write(JSON.stringify(previewOccasionMigration(JSON.parse(fs.readFileSync(args[0], 'utf8'))), null, 2) + '\n');}
    catch {process.stderr.write('Invalid or unreadable offline inventory. No writes performed.\n'); process.exitCode = 1;}
  }
}
