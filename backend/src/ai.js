import { GoogleGenAI } from '@google/genai';

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((token) => token.length > 2);
const eligibleForStudent = (resource) => resource.eligibility.every((requirement) => requirement.toLowerCase() === 'active student account');

export function deterministicResourceMatch(query, resources) {
  const queryTokens = new Set(normalize(query));
  return resources.filter(eligibleForStudent).map((resource) => {
    const searchable = normalize([resource.title, resource.description, resource.category, resource.location, resource.accessRules, ...resource.eligibility].join(' '));
    const score = searchable.reduce((total, token) => total + (queryTokens.has(token) ? 1 : 0), 0);
    return { resource, score };
  }).filter(({ score }) => score > 0).sort((left, right) => right.score - left.score || left.resource.id - right.resource.id).slice(0, 8).map(({ resource, score }) => ({ ...resource, matchScore: score, matchReason: 'Matched by category, description, location, availability, and verified student eligibility.' }));
}

export async function matchResourcesWithGemini(query, resources) {
  if (!process.env.GEMINI_API_KEY) return { source: 'fallback', recommendations: deterministicResourceMatch(query, resources), reason: 'Gemini is not configured; deterministic matching was used.' };
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const catalog = resources.filter(eligibleForStudent).map((resource) => ({ id: resource.id, title: resource.title, category: resource.category, hourlyPricePaise: resource.hourlyPricePaise, description: resource.description, location: resource.location, availability: resource.availability, accessRules: resource.accessRules, eligibility: resource.eligibility }));
    const response = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || 'gemini-3.8-flash', contents: `You are a resource discovery assistant. Recommend only IDs from this catalog. Never invent IDs or resources, never approve access, and do not recommend resources whose availability is not available. Return JSON only in the form {"recommendations":[{"id":number,"reason":string}]}. Student request: ${query}\nCatalog: ${JSON.stringify(catalog)}`, config: { responseMimeType: 'application/json', temperature: 0 } });
    const raw = typeof response.text === 'function' ? response.text() : response.text;
    const parsed = JSON.parse(raw || '{}');
    const byId = new Map(catalog.map((resource) => [resource.id, resource]));
    const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations.map((item) => ({ resource: byId.get(Number(item.id)), reason: typeof item.reason === 'string' ? item.reason : 'Recommended from the verified catalog.' })).filter((item) => item.resource).map(({ resource, reason }) => ({ ...resource, matchReason: reason })).slice(0, 8) : [];
    return { source: 'gemini', recommendations, reason: 'Recommendations were selected from verified available catalog records.' };
  } catch (error) {
    console.warn('Gemini resource matching unavailable:', error.message);
    return { source: 'fallback', recommendations: deterministicResourceMatch(query, resources), reason: 'Gemini was unavailable; deterministic matching was used.' };
  }
}
