# Security policy

## Reporting a vulnerability

**Do not file a public GitHub issue.** Report security vulnerabilities privately to:

**security@nomercy.tv**

or via the GitHub Security Advisory flow on the repository.

Please include:

- A description of the issue and its impact
- Steps to reproduce, with a minimal proof of concept
- The kit version (`@nomercy-entertainment/nomercy-video-player`) and any consumer package versions you tested against
- Your preferred contact for follow-up

We aim to acknowledge reports within 48 hours and to coordinate a fix and disclosure timeline with you.

## Supported versions

Only the latest `2.x` pre-release / release line receives security updates. v1 packages are frozen at last-published; security advisories will note v1-affected versions but no v1 patches will ship.

## Scope

In scope:

- The kit itself (`@nomercy-entertainment/nomercy-video-player`)
- Adapter ports + built-in plugins shipped from this package
- Cross-package vulnerabilities in `nomercy-video-player` or `nomercy-music-player` rooted in the kit

Out of scope:

- Issues in third-party consumer apps that integrate the kit
- Issues in `hls.js`, `audiomotion-analyzer`, or other peer dependencies — report those upstream
- Self-XSS via UI plugins where the consumer mounts untrusted content (consumer-side concern)
