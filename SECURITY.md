# Security Policy

Market Observer can interact with Cloudflare Workers, D1, LINE, TWSE data sources, and optional OpenAI API calls. Please treat credentials and runtime state carefully.

## Supported Versions

The `main` branch is the supported development line.

## Reporting a Vulnerability

Please open a GitHub issue for non-sensitive security hardening requests.

For sensitive reports involving tokens, secret leakage, authentication bypass, or production data exposure, please contact the maintainer privately before publishing details.

## Secret Handling

Do not commit:

- Cloudflare API tokens
- Wrangler credentials
- LINE channel access tokens
- OpenAI API keys
- admin endpoint tokens
- production D1 exports containing private data
- raw logs that include request tokens or user identifiers

Use environment variables, Wrangler secrets, and local-only configuration for credentials.
