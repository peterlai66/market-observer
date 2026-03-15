#!/usr/bin/env node
import { computeRecommendationReview, saveReviewSnapshot } from './_recommendation_review_lib.mjs';

const mode = (process.argv[2] || 'remote').trim().toLowerCase();
const remote = mode !== 'local';
const explicitDate = (process.argv[3] || '').trim();

console.log(`MO Recommendation Review Save (${remote ? 'remote' : 'local'})`);
const review = await computeRecommendationReview({ remote, explicitDate });
saveReviewSnapshot(review, remote);
console.log(review.lines.join('\n'));
console.log(`saved_batch=${review.batch.trade_date}`);
console.log(`saved_items=${review.items.length}`);
console.log('Recommendation review save OK');
