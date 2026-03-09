# Project Guidelines

## Overview

VS Code extension for managing RabbitMQ connections, queues, exchanges, and bindings. Uses the Management HTTP API and AMQP protocol. Independent project — not affiliated with Broadcom.

## Architecture

```
src/
  activation/       → Command registration (entry wiring)
  extension/        → Business logic, services, domain types, errors
    services/       → ConnectionStore, RabbitMqAdminService, etc.
    types/          → TypeScript interfaces (connection.ts, rabbitmq.ts)
  infra/rabbitmq/   → ManagementApiClient (HTTP), AmqpProbe, mappers
  ui/views/         → TreeDataProvider (RabbitMqExplorer)
  ui/webview/       → Webview panel (ResourceEditor)
  extension.ts      → Entry point, explicit DI wiring
```

- **Clean architecture**: extension → infra → UI, no reverse dependencies
- **Explicit DI**: Services receive dependencies via constructor; all wiring happens in `extension.ts` `activate()`
- **Error hierarchy**: All errors extend `AppError` with typed `code` field. Subtypes: `MissingConnectionError`, `ValidationError`, `ManagementApiError`
- **Tree views**: `BaseProvider<T extends ExplorerNode>` with discriminated union node types

## Build and Test

**Package manager**: Bun (v1.3.10+). Never use npm/yarn.

| Task | Command |
|------|---------|
| Full build | `bun run build` |
| Type-check | `bun run check-types` |
| Lint | `bun run lint` |
| Unit tests | `bun run test:unit` |
| Integration tests | `bun run test:integration` |
| Package VSIX | `bun run package:vsix` |

**Two bundle targets** (see `scripts/build.ts`):
- Extension: `src/extension.ts` → `dist/extension.js` (CJS, Node)
- Webview: `src/ui/webview/resourceEditorApp.ts` → `dist/webview/resourceEditorApp.js` (IIFE, browser)

Integration tests require `dist/extension.js` to exist — always build before running them.

## Code Style

- **Formatter/Linter**: Biome (double quotes, tab indentation, auto-organize imports)
- **TypeScript**: Strict mode, ES2022 target, Node16 modules, no implicit any
- **Files**: camelCase (`connectionStore.ts`). Classes: PascalCase. Interfaces: PascalCase, no `I` prefix

## Conventions

- **Commands**: Named `amqp-manager.[action]`, registered centrally in `registerCommands.ts`
- **Settings**: Workspace-scoped in `settings.json`. Legacy `rabbitmq.*` fallback exists — maintain backward compat
- **HTTP**: Uses the native Node.js `fetch` API for the RabbitMQ Management API, with `undici` only for TLS dispatcher configuration when needed
- **Testing**: Unit tests use Bun native runner (`bun:test`). Integration tests use `@vscode/test-electron` with `node:assert/strict`
- **Test file naming**: `[module].test.ts` in `test/unit/`
- **No external test mocks library** — stubs are inline or manual
- **Runtime dependencies**: `amqplib` and `undici`. Keep dependencies minimal
