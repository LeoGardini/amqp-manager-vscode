# AMQP Manager for VSCode

Manage AMQP brokers, queues, exchanges, and bindings from VSCode with native tree views and native commands.

This project is designed for brokers that expose a compatible HTTP management API, including RabbitMQ® deployments, but it is independent and unofficial.

## Features

- Save multiple broker connections in the current workspace.
- Validate connectivity with both `AMQP` and the `HTTP Management API`.
- List, create, edit, delete, and purge queues.
- List, create, edit, and delete exchanges.
- Publish messages directly from queue and exchange actions in the explorer.
- List, create, and delete bindings.
- Work entirely from native Activity Bar views, context menus, and JSON inspectors.

## Architecture

- `ConnectionStore` persists saved connections in `.vscode/settings.json`.
- `RabbitMqExplorer` coordinates the native tree views, split into connection refresh and broker resource refresh.
- `RabbitMqAdminService` bridges VS Code actions to compatible management APIs and AMQP health probes.

## Requirements

- A broker exposing a compatible HTTP management API.
- One HTTP(S) URL for the Management API.
- One `amqp://` or `amqps://` URL for the AMQP probe.
- Bun `>= 1.3.10` for local development and packaging.

## Configuration

The extension contributes these settings:

- `amqp-manager.defaultConnection`
- `amqp-manager.autoRefreshSeconds`
- `amqp-manager.requestTimeoutMs`
- `amqp-manager.confirmDestructiveActions`

Connections, including passwords, are stored in the workspace `settings.json` file. Selecting an active connection refreshes the dependent resource views.

## Trademark Notice

RabbitMQ is a trademark of Broadcom, Inc. This project is not affiliated with, endorsed by, or sponsored by Broadcom.

## Connection Flow

1. Add or edit a connection from the Connections view title actions.
2. The explorer refreshes the saved connections tree first.
3. Resource views load queues, exchanges, bindings, and health only after a valid active connection exists.
4. If the broker is unavailable, saved connections still remain visible and selectable.

## Commands

- `AMQP Manager: Focus Explorer`
- `AMQP Manager: Add Connection`
- `AMQP Manager: Edit Connection`
- `AMQP Manager: Remove Connection`
- `AMQP Manager: Refresh Active Connection`
- `AMQP Manager: Publish Message to Queue`
- `AMQP Manager: Publish Message to Exchange`

## Development

```bash
bun install
bun run build
bun run test:unit
bun run package:vsix
```
