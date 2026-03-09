import * as vscode from "vscode";

import { registerCommands } from "./activation/registerCommands";
import { ConnectionCommands } from "./extension/services/connectionCommands";
import { ConnectionStore } from "./extension/services/connectionStore";
import { RabbitMqAdminService } from "./extension/services/rabbitMqAdminService";
import { ResourceInputService } from "./extension/services/resourceInputService";
import { RabbitMqExplorer } from "./ui/views/rabbitMqExplorer";
import { ResourceEditorManager } from "./ui/webview/resourceEditorManager";

/**
 * Wires the native VS Code explorer, commands, and RabbitMQ services at activation time.
 */
export function activate(context: vscode.ExtensionContext): void {
	const connectionStore = new ConnectionStore(context);
	const connectionCommands = new ConnectionCommands(connectionStore);
	const rabbitMqAdminService = new RabbitMqAdminService(connectionStore);
	const resourceInputService = new ResourceInputService();
	const resourceEditor = new ResourceEditorManager(
		context,
		rabbitMqAdminService,
		connectionStore,
	);
	const explorer = new RabbitMqExplorer({
		connectionCommands,
		connectionStore,
		rabbitMqAdminService,
		resourceEditor,
		resourceInputService,
	});

	registerCommands(context, {
		connectionCommands,
		connectionStore,
		rabbitMqAdminService,
		explorer,
	});

	try {
		context.subscriptions.push(resourceEditor);
		explorer.register(context);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to initialize the AMQP Manager explorer.";
		console.error("[amqp-manager] activation failed", error);
		void vscode.window.showErrorMessage(message);
	}
}

export function deactivate(): void {}
