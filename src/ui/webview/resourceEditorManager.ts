import * as crypto from "node:crypto";

import * as vscode from "vscode";

import { ValidationError } from "../../extension/errors";
import {
	parseArgumentsText,
	stripExchangeArguments,
	stripQueueArguments,
} from "../../extension/rabbitmqArguments";
import type { ConnectionStore } from "../../extension/services/connectionStore";
import type { RabbitMqAdminService } from "../../extension/services/rabbitMqAdminService";
import { getExtensionSettings } from "../../extension/settings";
import type {
	BindingDetails,
	BindingInput,
	ExchangeDetails,
	ExchangeInput,
	PublishMessageInput,
	QueueDetails,
	QueueInput,
} from "../../extension/types/rabbitmq";
import type {
	BindingFormData,
	ExchangeEditorState,
	ExchangeSettingsFormData,
	OverviewItem,
	PublishFormData,
	QueueEditorState,
	QueueSettingsFormData,
	ResourceEditorHostMessage,
	ResourceEditorState,
	ResourceEditorViewMessage,
} from "./resourceEditorProtocol";

interface ResourceEditorTarget {
	kind: "queue" | "exchange";
	name: string;
	connectionId: string;
}

export interface ResourceEditorController {
	openQueue(queue: QueueDetails, connectionId?: string): Promise<void>;
	openExchange(exchange: ExchangeDetails, connectionId?: string): Promise<void>;
}

/**
 * Owns the lifecycle of resource webviews opened from the explorer tree.
 */
export class ResourceEditorManager
	implements vscode.Disposable, ResourceEditorController
{
	private readonly sessions = new Map<string, ResourceEditorSession>();

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly rabbitMqAdminService: RabbitMqAdminService,
		private readonly connectionStore: ConnectionStore,
	) {}

	dispose(): void {
		for (const session of this.sessions.values()) {
			session.dispose();
		}
		this.sessions.clear();
	}

	async openQueue(queue: QueueDetails, connectionId?: string): Promise<void> {
		await this.open({
			kind: "queue",
			name: queue.name,
			connectionId: await this.resolveConnectionId(connectionId),
		});
	}

	async openExchange(
		exchange: ExchangeDetails,
		connectionId?: string,
	): Promise<void> {
		await this.open({
			kind: "exchange",
			name: exchange.name,
			connectionId: await this.resolveConnectionId(connectionId),
		});
	}

	private async open(target: ResourceEditorTarget): Promise<void> {
		const key = createPanelKey(target);
		const existing = this.sessions.get(key);
		if (existing) {
			await existing.reveal();
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			"amqp-manager.resourceEditor",
			createPanelTitle(target),
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				localResourceRoots: [
					joinUriPath(this.context.extensionUri, "dist", "webview"),
				],
				retainContextWhenHidden: true,
			},
		);
		panel.iconPath = {
			light: joinUriPath(
				this.context.extensionUri,
				"resources",
				"icons",
				`${target.kind}.svg`,
			),
			dark: joinUriPath(
				this.context.extensionUri,
				"resources",
				"icons",
				`${target.kind}.svg`,
			),
		};

		const session = new ResourceEditorSession({
			context: this.context,
			connectionStore: this.connectionStore,
			onDispose: () => {
				this.sessions.delete(key);
			},
			panel,
			rabbitMqAdminService: this.rabbitMqAdminService,
			target,
		});
		this.sessions.set(key, session);
		await session.initialize();
	}

	private async resolveConnectionId(connectionId?: string): Promise<string> {
		const resolved =
			connectionId ?? (await this.connectionStore.getActiveConnectionId());
		if (!resolved) {
			throw new ValidationError("Select an active RabbitMQ connection first.");
		}

		return resolved;
	}
}

interface ResourceEditorSessionOptions {
	context: vscode.ExtensionContext;
	connectionStore: ConnectionStore;
	onDispose: () => void;
	panel: vscode.WebviewPanel;
	rabbitMqAdminService: RabbitMqAdminService;
	target: ResourceEditorTarget;
}

class ResourceEditorSession implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private isReady = false;
	private refreshTimer: ReturnType<typeof setInterval> | undefined;

	constructor(private readonly options: ResourceEditorSessionOptions) {}

	dispose(): void {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
		}
		vscode.Disposable.from(...this.disposables).dispose();
		this.options.onDispose();
	}

	async initialize(): Promise<void> {
		this.options.panel.webview.html = this.createWebviewHtml();
		this.disposables.push(
			this.options.panel.onDidDispose(() => {
				this.dispose();
			}),
			this.options.panel.onDidChangeViewState((event) => {
				if (event.webviewPanel.visible && this.isReady) {
					void this.refresh();
				}
			}),
			this.options.panel.webview.onDidReceiveMessage((message) => {
				void this.handleMessage(message as ResourceEditorViewMessage);
			}),
		);
	}

	async reveal(): Promise<void> {
		this.options.panel.reveal(vscode.ViewColumn.Beside, false);
		if (this.isReady) {
			await this.refresh();
		}
	}

	private async handleMessage(
		message: ResourceEditorViewMessage,
	): Promise<void> {
		switch (message.type) {
			case "ready":
				this.isReady = true;
				await this.refresh();
				return;
			case "refresh":
				await this.refresh(true);
				return;
			case "save-settings":
				await this.runOperation("Saving settings", async () => {
					if (this.options.target.kind === "queue") {
						await this.options.rabbitMqAdminService.updateQueue(
							parseQueueSettings(message.payload as QueueSettingsFormData),
							this.options.target.connectionId,
						);
						return "Queue settings updated.";
					}

					await this.ensureExchangeEditable();
					await this.options.rabbitMqAdminService.updateExchange(
						parseExchangeSettings(message.payload as ExchangeSettingsFormData),
						this.options.target.connectionId,
					);
					return "Exchange settings updated.";
				});
				return;
			case "save-binding":
				await this.runOperation("Saving binding", async () => {
					const bindingInput = parseBindingInput(
						this.options.target,
						message.payload.binding,
					);
					if (message.payload.original) {
						await this.ensureBindingEditable(message.payload.original);
						await this.options.rabbitMqAdminService.replaceBinding(
							message.payload.original,
							bindingInput,
							this.options.target.connectionId,
						);
						return "Binding updated.";
					}

					await this.ensureBindingCreationAllowed();
					await this.options.rabbitMqAdminService.createBinding(
						bindingInput,
						this.options.target.connectionId,
					);
					return "Binding created.";
				});
				return;
			case "delete-binding":
				await this.runOperation("Removing binding", async () => {
					await this.ensureBindingEditable(message.payload.binding);
					await this.confirmDestructive(
						`Delete binding "${message.payload.binding.source || "(default)"}" -> "${message.payload.binding.destination}"?`,
					);
					await this.options.rabbitMqAdminService.deleteBinding(
						message.payload.binding,
						this.options.target.connectionId,
					);
					return "Binding removed.";
				});
				return;
			case "publish-message":
				await this.runOperation("Publishing message", async () => {
					const routed = await this.options.rabbitMqAdminService.publishMessage(
						parsePublishInput(message.payload),
						this.options.target.connectionId,
					);
					if (routed) {
						return "Message published successfully.";
					}

					vscode.window.showWarningMessage(
						"The broker accepted the message, but reported that it was not routed.",
					);
					return {
						kind: "info" as const,
						message:
							"The broker accepted the message, but reported that it was not routed.",
					};
				});
				return;
		}
	}

	private async runOperation(
		action: string,
		operation: () => Promise<
			string | { kind: "success" | "info"; message: string }
		>,
	): Promise<void> {
		await this.postBusy(true, action);
		try {
			const result = await operation();
			const normalized =
				typeof result === "string"
					? ({ kind: "success", message: result } as const)
					: result;
			if (normalized.kind === "success") {
				void vscode.window.showInformationMessage(normalized.message);
			}
			await this.postMessage({
				type: "operation-result",
				payload: normalized,
			});
			await this.refresh();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "The operation failed.";
			await this.postMessage({
				type: "operation-result",
				payload: { kind: "error", message },
			});
			void vscode.window.showErrorMessage(message);
		} finally {
			await this.postBusy(false, action);
		}
	}

	private async refresh(showBusy = false): Promise<void> {
		if (!this.isReady) {
			return;
		}

		if (showBusy) {
			await this.postBusy(true, "Refreshing");
		}
		try {
			const state = await this.buildState();
			this.options.panel.title = state.title;
			this.applyAutoRefresh(state.autoRefreshSeconds);
			await this.postMessage({ type: "state", payload: state });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to load resource data.";
			await this.postMessage({
				type: "operation-result",
				payload: { kind: "error", message },
			});
			void vscode.window.showErrorMessage(message);
		} finally {
			if (showBusy) {
				await this.postBusy(false, "Refreshing");
			}
		}
	}

	private async buildState(): Promise<ResourceEditorState> {
		if (this.options.target.kind === "queue") {
			const [resolvedConnection, queue, bindings, allQueues, allExchanges] =
				await Promise.all([
					this.options.connectionStore.resolveConnection(
						this.options.target.connectionId,
					),
					this.options.rabbitMqAdminService.getQueue(
						this.options.target.name,
						this.options.target.connectionId,
					),
					this.options.rabbitMqAdminService.listQueueBindings(
						this.options.target.name,
						this.options.target.connectionId,
					),
					this.options.rabbitMqAdminService.listQueues(
						this.options.target.connectionId,
					),
					this.options.rabbitMqAdminService.listExchanges(
						this.options.target.connectionId,
					),
				]);
			return buildQueueState(
				resolvedConnection.profile.name,
				this.options.target.connectionId,
				queue,
				bindings,
				allQueues.map((q) => q.name).sort(),
				allExchanges
					.map((e) => e.name)
					.filter((n) => n !== "")
					.sort(),
			);
		}

		const [resolvedConnection, exchange, bindings, allQueues, allExchanges] =
			await Promise.all([
				this.options.connectionStore.resolveConnection(
					this.options.target.connectionId,
				),
				this.options.rabbitMqAdminService.getExchange(
					this.options.target.name,
					this.options.target.connectionId,
				),
				this.options.rabbitMqAdminService.listExchangeBindings(
					this.options.target.name,
					this.options.target.connectionId,
				),
				this.options.rabbitMqAdminService.listQueues(
					this.options.target.connectionId,
				),
				this.options.rabbitMqAdminService.listExchanges(
					this.options.target.connectionId,
				),
			]);
		return buildExchangeState(
			resolvedConnection.profile.name,
			this.options.target.connectionId,
			exchange,
			bindings,
			allQueues.map((q) => q.name).sort(),
			allExchanges
				.map((e) => e.name)
				.filter((n) => n !== "")
				.sort(),
		);
	}

	private applyAutoRefresh(autoRefreshSeconds: number): void {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
			this.refreshTimer = undefined;
		}
		if (autoRefreshSeconds <= 0) {
			return;
		}

		this.refreshTimer = setInterval(() => {
			if (this.options.panel.visible) {
				void this.refresh();
			}
		}, autoRefreshSeconds * 1000);
	}

	private async postBusy(busy: boolean, action: string): Promise<void> {
		await this.postMessage({
			type: "busy",
			payload: { busy, action },
		});
	}

	private async postMessage(message: ResourceEditorHostMessage): Promise<void> {
		await this.options.panel.webview.postMessage(message);
	}

	private async confirmDestructive(message: string): Promise<void> {
		if (!getExtensionSettings().confirmDestructiveActions) {
			return;
		}

		const confirmation = await vscode.window.showWarningMessage(
			message,
			{ modal: true },
			"Continue",
		);
		if (confirmation !== "Continue") {
			throw new Error("Operation cancelled.");
		}
	}

	private async ensureExchangeEditable(): Promise<void> {
		if (
			this.options.target.kind === "exchange" &&
			this.options.target.name === ""
		) {
			throw new ValidationError(
				"The default exchange is managed by RabbitMQ and cannot be reconfigured.",
			);
		}
	}

	private async ensureBindingCreationAllowed(): Promise<void> {
		if (
			this.options.target.kind === "exchange" &&
			this.options.target.name === ""
		) {
			throw new ValidationError(
				"Bindings cannot be managed from the default exchange.",
			);
		}
	}

	private async ensureBindingEditable(binding: BindingDetails): Promise<void> {
		if (!binding.source.trim()) {
			throw new ValidationError(
				"The implicit default exchange binding cannot be edited or removed.",
			);
		}
		await this.ensureBindingCreationAllowed();
	}

	private createWebviewHtml(): string {
		const scriptUri = this.options.panel.webview.asWebviewUri(
			joinUriPath(
				this.options.context.extensionUri,
				"dist",
				"webview",
				"resourceEditorApp.js",
			),
		);
		const nonce = crypto.randomBytes(16).toString("base64");

		return `<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta
			name="viewport"
			content="width=device-width, initial-scale=1.0"
		/>
		<meta
			http-equiv="Content-Security-Policy"
			content="default-src 'none'; img-src ${this.options.panel.webview.cspSource} data:; font-src ${this.options.panel.webview.cspSource}; style-src ${this.options.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
		/>
		<title>${escapeHtml(createPanelTitle(this.options.target))}</title>
	</head>
	<body>
		<div id="app">Loading editor…</div>
		<script nonce="${nonce}" src="${scriptUri}"></script>
	</body>
</html>`;
	}
}

function buildQueueState(
	connectionName: string,
	connectionId: string,
	queue: QueueDetails,
	bindings: BindingDetails[],
	queueNames: string[],
	exchangeNames: string[],
): QueueEditorState {
	return {
		kind: "queue",
		title: `Queue • ${queue.name}`,
		connectionId,
		connectionName,
		vhost: queue.vhost,
		lastLoadedAt: new Date().toISOString(),
		autoRefreshSeconds: getExtensionSettings().autoRefreshSeconds,
		notices: [
			"Some broker-level queue changes may require deleting and recreating the queue to take full effect.",
		],
		canEditSettings: true,
		canManageBindings: true,
		canPublish: true,
		overviewItems: createQueueOverview(queue),
		exchangeNames,
		queueNames,
		queue,
		settings: {
			name: queue.name,
			durable: queue.durable,
			autoDelete: queue.autoDelete,
			exclusive: queue.exclusive,
			deadLetterExchange: asString(queue.arguments["x-dead-letter-exchange"]),
			deadLetterRoutingKey: asString(
				queue.arguments["x-dead-letter-routing-key"],
			),
			messageTtl: asNumberString(queue.arguments["x-message-ttl"]),
			argumentsText: JSON.stringify(
				stripQueueArguments(queue.arguments),
				null,
				2,
			),
		},
		bindings,
		binding: {
			source: "",
			destination: queue.name,
			destinationType: "queue",
			routingKey: "",
			argumentsText: "{}",
		},
		publish: {
			exchange: "",
			routingKey: queue.name,
			payload: "",
			propertiesText: "{}",
		},
	};
}

function buildExchangeState(
	connectionName: string,
	connectionId: string,
	exchange: ExchangeDetails,
	bindings: BindingDetails[],
	queueNames: string[],
	exchangeNames: string[],
): ExchangeEditorState {
	const isDefaultExchange = exchange.name === "";
	const displayName = exchange.name || "(default)";
	const notices = [
		"Some broker-level exchange changes may require deleting and recreating the exchange to take full effect.",
	];
	if (isDefaultExchange) {
		notices.unshift(
			"The default exchange is managed by RabbitMQ. Settings and bindings are read-only here, but publishing is still available.",
		);
	}

	return {
		kind: "exchange",
		title: `Exchange • ${displayName}`,
		connectionId,
		connectionName,
		vhost: exchange.vhost,
		lastLoadedAt: new Date().toISOString(),
		autoRefreshSeconds: getExtensionSettings().autoRefreshSeconds,
		notices,
		canEditSettings: !isDefaultExchange,
		canManageBindings: !isDefaultExchange,
		canPublish: true,
		overviewItems: createExchangeOverview(exchange),
		exchangeNames,
		queueNames,
		exchange,
		settings: {
			name: exchange.name,
			type: exchange.type,
			durable: exchange.durable,
			autoDelete: exchange.autoDelete,
			internal: exchange.internal,
			alternateExchange: asString(exchange.arguments["alternate-exchange"]),
			argumentsText: JSON.stringify(
				stripExchangeArguments(exchange.arguments),
				null,
				2,
			),
		},
		bindings,
		binding: {
			source: exchange.name,
			destination: "",
			destinationType: "queue",
			routingKey: "",
			argumentsText: "{}",
		},
		publish: {
			exchange: exchange.name,
			routingKey: "",
			payload: "",
			propertiesText: "{}",
		},
		isDefaultExchange,
	};
}

function createQueueOverview(queue: QueueDetails): OverviewItem[] {
	return [
		{ label: "Name", value: queue.name },
		{ label: "VHost", value: queue.vhost },
		{ label: "State", value: queue.state ?? "unknown" },
		{ label: "Consumers", value: String(queue.consumers ?? 0) },
		{ label: "Messages", value: String(queue.messages ?? 0) },
		{ label: "Ready", value: String(queue.readyMessages ?? 0) },
		{
			label: "Unacked",
			value: String(queue.unackedMessages ?? 0),
		},
		{ label: "Durable", value: formatBoolean(queue.durable) },
		{ label: "Auto Delete", value: formatBoolean(queue.autoDelete) },
		{ label: "Exclusive", value: formatBoolean(queue.exclusive) },
	];
}

function createExchangeOverview(exchange: ExchangeDetails): OverviewItem[] {
	return [
		{ label: "Name", value: exchange.name || "(default)" },
		{ label: "VHost", value: exchange.vhost },
		{ label: "Type", value: exchange.type },
		{ label: "Durable", value: formatBoolean(exchange.durable) },
		{ label: "Auto Delete", value: formatBoolean(exchange.autoDelete) },
		{ label: "Internal", value: formatBoolean(exchange.internal) },
	];
}

function parseQueueSettings(payload: QueueSettingsFormData): QueueInput {
	return {
		name: requireText(payload.name, "Queue name"),
		durable: payload.durable,
		autoDelete: payload.autoDelete,
		exclusive: payload.exclusive,
		deadLetterExchange: normalizeOptional(payload.deadLetterExchange),
		deadLetterRoutingKey: normalizeOptional(payload.deadLetterRoutingKey),
		messageTtl: normalizeNumber(payload.messageTtl),
		arguments: parseArgumentsText(payload.argumentsText),
	};
}

function parseExchangeSettings(
	payload: ExchangeSettingsFormData,
): ExchangeInput {
	return {
		name: requireText(payload.name, "Exchange name"),
		type: requireText(payload.type, "Exchange type"),
		durable: payload.durable,
		autoDelete: payload.autoDelete,
		internal: payload.internal,
		alternateExchange: normalizeOptional(payload.alternateExchange),
		arguments: parseArgumentsText(payload.argumentsText),
	};
}

function parseBindingInput(
	target: ResourceEditorTarget,
	payload: BindingFormData,
): BindingInput {
	if (target.kind === "queue") {
		return {
			source: requireText(payload.source, "Source exchange"),
			destination: target.name,
			destinationType: "queue",
			routingKey: payload.routingKey.trim(),
			arguments: parseArgumentsText(payload.argumentsText),
		};
	}

	if (!target.name.trim()) {
		throw new ValidationError(
			"Bindings cannot be managed from the default exchange.",
		);
	}

	return {
		source: target.name,
		destination: requireText(payload.destination, "Binding destination"),
		destinationType: payload.destinationType,
		routingKey: payload.routingKey.trim(),
		arguments: parseArgumentsText(payload.argumentsText),
	};
}

function parsePublishInput(payload: PublishFormData): PublishMessageInput {
	return {
		exchange: payload.exchange,
		routingKey: payload.routingKey.trim(),
		payload: requireText(payload.payload, "Message payload"),
		properties: parseArgumentsText(payload.propertiesText),
	};
}

function requireText(value: string, label: string): string {
	const normalized = value.trim();
	if (!normalized) {
		throw new ValidationError(`${label} is required.`);
	}

	return normalized;
}

function normalizeOptional(value: string): string | undefined {
	const normalized = value.trim();
	return normalized ? normalized : undefined;
}

function normalizeNumber(value: string): number | undefined {
	const normalized = value.trim();
	if (!normalized) {
		return undefined;
	}

	const parsed = Number(normalized);
	if (!Number.isFinite(parsed)) {
		throw new ValidationError("Numeric fields must contain a valid number.");
	}

	return parsed;
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function asNumberString(value: unknown): string {
	return typeof value === "number" ? String(value) : "";
}

function formatBoolean(value: boolean): string {
	return value ? "Yes" : "No";
}

function createPanelKey(target: ResourceEditorTarget): string {
	return [target.connectionId, target.kind, target.name || "(default)"].join(
		"::",
	);
}

function createPanelTitle(target: ResourceEditorTarget): string {
	const label = target.kind === "queue" ? "Queue" : "Exchange";
	const name = target.name || "(default)";
	return `${label}: ${name}`;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function joinUriPath(base: vscode.Uri, ...segments: string[]): vscode.Uri {
	const nextPath = [base.path.replace(/\/$/, ""), ...segments].join("/");
	return base.with({ path: nextPath });
}
