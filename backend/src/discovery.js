import fs from 'node:fs';

// This reviewed snapshot is deliberately separate from the database. Removing an
// entry restores discovery; edited or reused IDs never match an old snapshot.
export function createDiscoveryFilter(manifestPath) {
  let previousText;
  let exclusions;
  function currentExclusions() {
    // Read the small reviewed manifest per request so additions and reversals do
    // not depend on restarting the API. Invalid/unreadable files fail closed.
    const text = fs.readFileSync(manifestPath, 'utf8');
    if (text !== previousText) {
      const manifest = JSON.parse(text);
      const updated = new Map(manifest.records.map(record => [record.id, record]));
      exclusions = updated;
      previousText = text;
    }
    return exclusions;
  }
  function matches(resource, snapshots) {
    const snapshot = snapshots.get(resource.id);
    return Boolean(snapshot && ['title', 'description', 'category', 'location', 'ownerId'].every(key => resource[key] === snapshot[key]));
  }
  return {
    isDiscoveryExcluded: resource => matches(resource, currentExclusions()),
    publicResources: resources => {
      const snapshots = currentExclusions();
      return resources.filter(resource => !matches(resource, snapshots));
    },
  };
}
export const { isDiscoveryExcluded, publicResources } = createDiscoveryFilter(new URL('../config/discovery-exclusions.json', import.meta.url));
