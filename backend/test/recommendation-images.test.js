import test from 'node:test';
import assert from 'node:assert/strict';
import { withRecommendationImages } from '../../frontend/app/lib/recommendation-images.ts';

test('missing recommendation images resolve by ID even with identical resource titles', () => {
  const recommendations = [{ id: 3, title: 'Computer Lab', matchScore: 9 }, { id: 1, title: 'Computer Lab', matchScore: 4 }, { id: 2, title: 'computer lab', matchScore: 3 }];
  const result = withRecommendationImages(recommendations, [{ id: 1, imageUrl: '/resource-images/aaa.jpg' }, { id: 2, imageUrl: '/resource-images/bbb.jpg' }, { id: 3, imageUrl: '/resource-images/ccc.jpg' }]);
  assert.deepEqual(result.map(item => item.imageUrl), ['/resource-images/ccc.jpg', '/resource-images/aaa.jpg', '/resource-images/bbb.jpg']);
  assert.deepEqual(result.map(item => item.id), [3, 1, 2]);
  assert.deepEqual(result.map(item => item.matchScore), [9, 4, 3]);
  assert.ok(recommendations.every(item => !('imageUrl' in item)));
});

test('existing image references and explicit no-upload references are preserved; absent IDs use fallback', () => {
  const result = withRecommendationImages([{ id: 1, imageUrl: '/resource-images/existing.jpg' }, { id: 2, imageUrl: null }, { id: 3 }], [{ id: 1, imageUrl: '/resource-images/other.jpg' }, { id: 2, imageUrl: '/resource-images/other.jpg' }]);
  assert.equal(result[0].imageUrl, '/resource-images/existing.jpg');
  assert.equal(result[1].imageUrl, null);
  assert.equal(result[2].imageUrl, null);
});
