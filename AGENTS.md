# Code Rules

## Priorities

1. Preserve and improve the existing architecture, DX, and UX.
2. Stay consistent with the existing codebase and conventions.
3. Keep changes minimal, focused, and easy to review.

## Implementation

- Write clean, maintainable, and well-documented code.
- Use TypeScript for all new code.
- Never use `any`.
- Prefer existing patterns, utilities, and types over introducing new ones.
- Do not refactor unrelated code unless it is necessary for the task.

## Testing and Validation

Ensure all new code is covered by tests.

Before finishing, run:

```bash
pnpm test
pnpm check 2>&1
timeout 30 npx convex dev --once 2>&1 || true
pnpm format && pnpm lint
```

Fix all errors and warnings related to your changes.

## Documentation

If you add a feature or change the API, run changeset and document there the changes. Stick to the format in `CHANGELOG.md`. Also update the `README.md` if needed.
