## Summary

<!-- 1–3 bullet points describing what this PR does and why -->

-

## Linked Spec & Issue

- **GitHub Issue**: #
- **Spec**: `specs/NNN-feature-name/spec.md`
- **Feature branch**: `NNN-feature-name`

---

## BA/Product Agent — Spec Compliance

> Reviewer Agent: verify each item against `spec.md` before approving.

- [ ] All functional requirements (FR-NNN) addressed or explicitly deferred with justification
- [ ] All user story acceptance scenarios covered by tests or demonstrable behaviour
- [ ] No scope creep — changes are bounded by the spec
- [ ] Key entities in code match the data model defined in the spec

---

## Developer Agent — Implementation Checklist

- [ ] Tests written **before** implementation (TDD — red before green)
- [ ] Unit tests present for all new functions/methods
- [ ] Integration tests present for all new API endpoints or service interactions
- [ ] Code coverage ≥ threshold defined in constitution (verified by CI report)
- [ ] No raw debug output in committed code — structured logging used
- [ ] No hardcoded secrets, credentials, or API keys
- [ ] All user-supplied inputs validated at system boundaries
- [ ] Queries use parameterised inputs (no string concatenation)

---

## Constitution Compliance (NON-NEGOTIABLE)

> Read `.specify/memory/constitution.md` for the full list of non-negotiable rules.
> Any rule from the constitution that is violated is a **BLOCKER** — PR MUST NOT merge.

- [ ] All constitution security requirements verified (see constitution for details)
- [ ] All constitution code quality requirements verified (see constitution for details)
- [ ] All constitution process requirements verified (see constitution for details)

---

## Reviewer Agent Sign-off

- [ ] Spec compliance verified (all FR-NNN checked above)
- [ ] Constitution compliance verified
- [ ] No `BLOCKER:` comments remaining unresolved
- [ ] Code is readable, minimal, and free of unnecessary abstractions

**Reviewer**: <!-- @mention or "Reviewer Agent session YYYY-MM-DD" -->

---

## QA Agent Sign-off

- [ ] QA Report posted as PR comment
- [ ] All automated gates passed (tests, coverage, lint, format)
- [ ] All manual acceptance scenarios executed

**QA**: <!-- @mention or "QA Agent session YYYY-MM-DD" -->

---

## Security Agent Sign-off (if triggered)

- [ ] Security Review posted as PR comment
- [ ] No CRITICAL or HIGH findings unresolved

**Security**: <!-- @mention or "Security Agent session YYYY-MM-DD" or "Not required" -->

---

## QA/Test Agent Sign-off

- [ ] Full test suite passes
- [ ] Coverage threshold met
- [ ] Manual acceptance scenarios from spec.md executed and passing
- [ ] No regressions introduced in previously passing tests

**QA**: <!-- @mention or "QA Agent session YYYY-MM-DD" -->

---

## Post-merge

- [ ] Deployment to staging verified (CI deploy job green)
- [ ] Smoke tests passing on staging
- [ ] No unexpected cost increase
