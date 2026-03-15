# Release Contract

A build may be declared releasable only when:

1. update completed
2. typecheck passed
3. doctor passed
4. smoke-worker passed
5. deploy completed
6. requested functional checks passed
7. release approval explicitly granted

Only then:
- git commit
- git push
