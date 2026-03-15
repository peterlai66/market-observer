# Developer Scripts Guide – Market Observer

This document explains the development tooling used in MO.

## Validation Commands

Type check:

npm run typecheck

Project integrity:

npm run mo -- doctor

Worker build validation:

npm run mo -- smoke-worker

## Release Validation

Before declaring a release candidate valid:

npm run typecheck
npm run mo -- doctor
npm run mo -- smoke-worker

All checks must pass before deployment.

## Deployment

Cloudflare deployment:

wrangler deploy

## Git Release Procedure

After validation and deployment verification:

git add .
git commit -m "release: vX.X.X <summary>"
git push
