# Developer Scripts Guide

## Baseline Validation
npm run typecheck
npm run mo -- doctor
npm run mo -- smoke-worker

## Release Validation
Run all baseline validation commands before release judgment.

## Git Synchronization
After release approval:
git add .
git commit -m "release: vX.X.X <summary>"
git push

## Future CLI Recommendation
Recommended MO CLI helpers:
- mo release-check
- mo git-status
- mo sync-check
- mo git-commit
