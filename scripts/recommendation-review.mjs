#!/usr/bin/env node
import { computeRecommendationReview } from './_recommendation_review_lib.mjs';

const mode = (process.argv[2] || 'remote').trim().toLowerCase();
const remote = mode !== 'local';
const explicitDate = (process.argv[3] || '').trim();

console.log(`MO Recommendation Review (${remote ? 'remote' : 'local'})`);
const review = await computeRecommendationReview({ remote, explicitDate });
console.log(review.lines.join('\n'));
console.log('Recommendation review OK');
