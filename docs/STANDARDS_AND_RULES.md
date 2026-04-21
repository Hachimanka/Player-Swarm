# Standards & Rules

## Environment Variables

- Every configurable value (URLs, scopes, limits, credentials) must be defined in `.env` and `.env.example`.
- All env vars must be read through `src/environments/index.ts` — never access `process.env` directly outside of that file.
- Always provide a `??` fallback default in `environments/index.ts` so the type resolves to `string` or `number`, never `string | undefined`, unless the value is intentionally optional.
- Secrets and credentials should have no fallback and must be validated at runtime via `assertRuntimeConfig()`.

## Barrel Index Files (`index.ts`)

- Every folder under `src/` that contains multiple files should have an `index.ts` barrel that re-exports everything public from that folder.
- All imports into a folder should go through its `index.ts` — avoid importing another folder's internal file directly.
- Internal imports within the same folder may import directly from sibling files to avoid circular dependencies.

## Path Aliases

Always use path aliases instead of long relative paths when importing across folders.

- `@controllers/*` → `src/controllers/*`
- `@services/*` → `src/services/*`
- `@routes/*` → `src/routes/*`
- `@middlewares/*` → `src/middlewares/*`
- `@utils/*` → `src/utils/*`
- `@types/*` → `src/types/*`
- `@interfaces/*` → `src/interfaces/*`
- `@schemas/*` → `src/schemas/*`

Aliases must be registered in both `tsconfig.json` (`paths`) and `package.json` (`_moduleAliases`).

## Response Format

Controller responses should use `ResponsePayload` from `@interfaces/index`.

```typescript
import { ResponsePayload } from '@interfaces/index';

res.status(200).json(new ResponsePayload('success', data));
res.status(400).json(new ResponsePayload('error', { error: 'message' }));
```

## JSDoc

- Every exported function, class, method, and constant should have a JSDoc comment.
- Keep comments concise — prefer a single line unless more detail is genuinely needed.
- Private helper functions should also have a short comment describing what they do.

## TypeScript

- Strict mode is enabled — avoid `any` wherever possible.
- Prefer `unknown` plus narrowing over `any`.
- All types and interfaces should live in `src/types/` and be exported via `src/types/index.ts`.

## Adding a New Feature

1. Define types in `src/types/`
2. Create service logic in `src/services/<feature>/`
3. Create controller in `src/controllers/<feature>/`
4. Define routes in `src/routes/<feature>/`
5. Register the router in `src/routes/index.ts`
6. Export everything through the folder's `index.ts`
7. Add any new env vars to `.env`, `.env.example`, and `src/environments/index.ts`
