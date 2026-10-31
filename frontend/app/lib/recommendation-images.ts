type ResourcePhoto = { id: number; imageUrl?: string | null };

// Enrich by verified resource ID, retaining the original order and all ranking
// fields. A missing catalog record gets the existing illustration fallback.
export function withRecommendationImages<T extends ResourcePhoto>(recommendations: T[], resources: ResourcePhoto[]): T[] {
  const byId = new Map(resources.map(resource => [resource.id, resource.imageUrl]));
  return recommendations.map(item => item.imageUrl === undefined ? { ...item, imageUrl: byId.get(item.id) ?? null } : item);
}
