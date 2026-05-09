# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest (`main`) | ✅ |
| older releases | check release notes |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub Issues.**

### Preferred Channel

<!-- TODO: Replace with your actual contact — e.g. security@yourcompany.com -->
Email: **[security@your-domain.com]**

Include in your report:
- A description of the vulnerability and the component affected
- Steps to reproduce (even a rough proof-of-concept helps)
- Your assessment of severity and potential impact
- Any suggested remediation you have in mind

### What Happens Next

| Step | Timeline |
|------|----------|
| Acknowledgement | Within 2 business days |
| Initial assessment | Within 5 business days |
| Fix or mitigation | Depends on severity — see below |
| Public disclosure | Coordinated with the reporter |

### Severity SLAs

| Severity | Target fix timeline |
|----------|-------------------|
| Critical | 24–72 hours |
| High | 7 days |
| Medium | 30 days |
| Low | Next scheduled release |

## Disclosure Policy

- We follow **coordinated disclosure** — we ask reporters to keep findings private
  until we have released a fix or issued a mitigation
- We will credit reporters in the release notes (unless they prefer to remain anonymous)
- We will not pursue legal action against reporters acting in good faith

## Scope

The following are **in scope**:

- All code in this repository
- Dependencies introduced by this project
- CI/CD pipeline configuration (if it introduces supply-chain risk)

The following are **out of scope**:

- Vulnerabilities in upstream dependencies (report to the upstream project; notify us separately)
- Social engineering attacks
- Physical access attacks
- Denial-of-service via resource exhaustion without a realistic exploit path

## Security Agents

This project uses an automated **Security Agent** that reviews every PR for OWASP
Top 10 vulnerabilities. Trigger it on any PR by commenting:

```
@security-agent
```

See [README.md](../README.md) for the full agent reference.
