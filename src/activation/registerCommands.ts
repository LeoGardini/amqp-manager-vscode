import * as vscode from "vscode";

import type { ConnectionCommands } from "../extension/services/connectionCommands";
import type { ConnectionStore } from "../extension/services/connectionStore";
import type { RabbitMqAdminService } from "../extension/services/rabbitMqAdminService";
import type {
	BindingNode,
	ConnectionNode,
	ExchangeNode,
	QueueNode,
	RabbitMqExplorer,
} from "../ui/views/rabbitMqExplorer";

interface CommandDependencies {
	connectionCommands: ConnectionCommands;
	connectionStore: ConnectionStore;
	rabbitMqAdminService: RabbitMqAdminService;
	explorer: RabbitMqExplorer;
}

export function registerCommands(
	context: vscode.ExtensionContext,
	dependencies: CommandDependencies,
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand("amqp-manager.openPanel", () =>
			dependencies.explorer.focus(),
		),
		vscode.commands.registerCommand("amqp-manager.addConnection", async () => {
			await dependencies.explorer.addConnection();
		}),
		vscode.commands.registerCommand(
			"amqp-manager.editConnection",
			async (node?: ConnectionNode) => {
				await dependencies.explorer.editConnection(node);
			},
		),
		vscode.commands.registerCommand(
			"amqp-manager.removeConnection",
			async (node?: ConnectionNode) => {
				await dependencies.explorer.removeConnection(node);
			},
		),
		vscode.commands.registerCommand(
			"amqp-manager.refreshActiveConnection",
			async () => {
				await dependencies.explorer.refresh();
			},
		),
		vscode.commands.registerCommand(
			"amqp-manager.setActiveConnection",
			async (nodeOrId: ConnectionNode | string) => {
				await dependencies.explorer.setActiveConnection(nodeOrId);
			},
		),
		vscode.commands.registerCommand(
			"amqp-manager.testActiveConnection",
			async (node?: ConnectionNode) => {
				await dependencies.explorer.testActiveConnection(node);
			},
		),
		vscode.commands.registerCommand("amqp-manager.createQueue", async () => {
			await dependencies.explorer.createQueue();
		}),
		vscode.commands.registerCommand(
			"amqp-manager.inspectQueue",
			async (node: QueueNode) => {
				await dependencies.explorer.inspectQueue(node);
			},
		),
		vscode.commands.registerCommand(
			"amqp-manager.editQueue",
			async (node: QueueNode) => {
				await dependencies.explorer.editQueue(node);
			},
		),
		vscode.commands.registerCommand(
			"amqp-manager.deleteQueue",
			async (node: QueueNode) => {
				await dependencies.explorer.deleteQueue(node);
			},
		),
		vscode.commands.registerCommand(
			"amqp-manager.purgeQueue",
			async (node: QueueNode) => {
				await dependencies.explorer.purgeQueue(node);
			},
		),
		vscode.commands.registerCommand(
			"amqp-manager.listQueueMessages",
			async (node: QueueNode) => {
				await dependencies.explorer.listQueueMessages(node);
			},
		),
		vscode.commands.registerCommand(
			"amqp-manager.publishQueue",
			async (node: QueueNode) => {
				await dependencies.explorer.publishQueue(node);
			},
		),
		vscode.commands.registerCommand("amqp-manager.createExchange", async () => {
			await dependencies.explorer.createExchange();
		}),
		vscode.commands.registerCommand(
			"amqp-manager.inspectExchange",
			async (node: ExchangeNode) => {
				await dependencies.explorer.inspectExchange(node);
			},
		),
		vscode.commands.registerCommand(
			"amqp-manager.editExchange",
			async (node: ExchangeNode) => {
				await dependencies.explorer.editExchange(node);
			},
		),
		vscode.commands.registerCommand(
			"amqp-manager.deleteExchange",
			async (node: ExchangeNode) => {
				await dependencies.explorer.deleteExchange(node);
			},
		),
		vscode.commands.registerCommand(
			"amqp-manager.publishExchange",
			async (node: ExchangeNode) => {
				await dependencies.explorer.publishExchange(node);
			},
		),
		vscode.commands.registerCommand("amqp-manager.createBinding", async () => {
			await dependencies.explorer.createBinding();
		}),
		vscode.commands.registerCommand(
			"amqp-manager.inspectBinding",
			async (node: BindingNode) => {
				await dependencies.explorer.inspectBinding(node);
			},
		),
		vscode.commands.registerCommand(
			"amqp-manager.deleteBinding",
			async (node: BindingNode) => {
				await dependencies.explorer.deleteBinding(node);
			},
		),
	);
}
