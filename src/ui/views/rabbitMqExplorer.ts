import * as vscode from "vscode";
import type { ConnectionCommands } from "../../extension/services/connectionCommands";
import type { ConnectionStore } from "../../extension/services/connectionStore";
import type { RabbitMqAdminService } from "../../extension/services/rabbitMqAdminService";
import type { ResourceInputService } from "../../extension/services/resourceInputService";
import { getExtensionSettings } from "../../extension/settings";
import type {
	ConnectionHealth,
	ConnectionSummary,
} from "../../extension/types/connection";
import type {
	BindingDetails,
	ExchangeDetails,
	QueueDetails,
	QueueMessageDetails,
	ResourceSnapshot,
} from "../../extension/types/rabbitmq";
import type { ResourceEditorController } from "../webview/resourceEditorManager";

const VIEW_CONTAINER_ID = "amqp-manager";
const CONNECTIONS_VIEW_ID = "amqp-manager.connections";
const QUEUES_VIEW_ID = "amqp-manager.queues";
const EXCHANGES_VIEW_ID = "amqp-manager.exchanges";
const BINDINGS_VIEW_ID = "amqp-manager.bindings";
const RABBITMQ_ACCENT_COLOR = "charts.orange";
const MUTED_ICON_COLOR = "descriptionForeground";

type ExplorerNode =
	| BindingNode
	| ConnectionNode
	| EmptyNode
	| ExchangeNode
	| QueueNode;

interface ExplorerDependencies {
	connectionStore: ConnectionStore;
	connectionCommands: ConnectionCommands;
	rabbitMqAdminService: RabbitMqAdminService;
	resourceInputService: ResourceInputService;
	resourceEditor?: ResourceEditorController;
}

/**
 * Shared tree provider with explicit refresh control from the explorer orchestration layer.
 */
abstract class BaseProvider<T extends ExplorerNode>
	implements vscode.TreeDataProvider<T>
{
	private readonly emitter = new vscode.EventEmitter<T | undefined | null>();
	readonly onDidChangeTreeData = this.emitter.event;

	refresh(): void {
		this.emitter.fire(undefined);
	}

	getTreeItem(element: T): vscode.TreeItem {
		return element;
	}

	abstract getChildren(element?: T): Promise<T[]>;
}

class ConnectionsProvider extends BaseProvider<ConnectionNode | EmptyNode> {
	constructor(private readonly explorer: RabbitMqExplorer) {
		super();
	}

	async getChildren(): Promise<Array<ConnectionNode | EmptyNode>> {
		return this.explorer.getConnectionNodes();
	}
}

class QueuesProvider extends BaseProvider<QueueNode | EmptyNode> {
	constructor(private readonly explorer: RabbitMqExplorer) {
		super();
	}

	async getChildren(): Promise<Array<QueueNode | EmptyNode>> {
		return this.explorer.getQueueNodes();
	}
}

class ExchangesProvider extends BaseProvider<ExchangeNode | EmptyNode> {
	constructor(private readonly explorer: RabbitMqExplorer) {
		super();
	}

	async getChildren(): Promise<Array<ExchangeNode | EmptyNode>> {
		return this.explorer.getExchangeNodes();
	}
}

class BindingsProvider extends BaseProvider<BindingNode | EmptyNode> {
	constructor(private readonly explorer: RabbitMqExplorer) {
		super();
	}

	async getChildren(): Promise<Array<BindingNode | EmptyNode>> {
		return this.explorer.getBindingNodes();
	}
}

class EmptyNode extends vscode.TreeItem {
	constructor(label: string, description: string, command?: vscode.Command) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.id = `empty:${label}:${description}`;
		this.description = description;
		this.contextValue = "amqp-manager.empty";
		this.iconPath = createThemeIcon("info", MUTED_ICON_COLOR);
		this.command = command;
	}
}

class ConnectionNode extends vscode.TreeItem {
	constructor(
		readonly connection: ConnectionSummary,
		active: boolean,
		health?: ConnectionHealth,
	) {
		super(connection.name, vscode.TreeItemCollapsibleState.None);
		this.id = connection.id;
		this.description = active ? "active" : connection.vhost;
		this.contextValue = active
			? "amqp-manager.connectionActive"
			: "amqp-manager.connection";
		this.iconPath = createThemeIcon(
			active ? "vm-active" : "plug",
			RABBITMQ_ACCENT_COLOR,
		);
		this.tooltip = [
			`${connection.username} @ ${connection.managementUrl}`,
			`AMQP: ${connection.amqpUrl}`,
			`VHost: ${connection.vhost}`,
			health
				? `Health: ${health.management.message} | ${health.amqp.message}`
				: "Health: not tested",
		].join("\n");
		this.command = {
			command: "amqp-manager.setActiveConnection",
			title: "Set Active AMQP Connection",
			arguments: [connection.id],
		};
	}
}

class QueueNode extends vscode.TreeItem {
	constructor(readonly queue: QueueDetails) {
		super(queue.name, vscode.TreeItemCollapsibleState.None);
		this.id = queue.id;
		this.description = `${queue.messages ?? 0} msg`;
		this.contextValue = "amqp-manager.queue";
		this.iconPath = createThemeIcon("list-tree", RABBITMQ_ACCENT_COLOR);
		this.tooltip = `${queue.vhost}\nConsumers: ${queue.consumers ?? 0}\nState: ${queue.state ?? "unknown"}`;
		this.command = {
			command: "amqp-manager.inspectQueue",
			title: "Inspect Queue",
			arguments: [queue],
		};
	}
}

class ExchangeNode extends vscode.TreeItem {
	constructor(readonly exchange: ExchangeDetails) {
		super(exchange.name || "(default)", vscode.TreeItemCollapsibleState.None);
		this.id = exchange.id;
		this.description = exchange.type;
		this.contextValue = "amqp-manager.exchange";
		this.iconPath = createThemeIcon("organization", RABBITMQ_ACCENT_COLOR);
		this.tooltip = `${exchange.vhost}\nType: ${exchange.type}`;
		this.command = {
			command: "amqp-manager.inspectExchange",
			title: "Inspect Exchange",
			arguments: [exchange],
		};
	}
}

class BindingNode extends vscode.TreeItem {
	constructor(readonly binding: BindingDetails) {
		super(
			`${binding.source || "(default)"} -> ${binding.destination}`,
			vscode.TreeItemCollapsibleState.None,
		);
		this.id = binding.id;
		this.description = binding.routingKey || "(empty)";
		this.contextValue = "amqp-manager.binding";
		this.iconPath = createThemeIcon("references", RABBITMQ_ACCENT_COLOR);
		this.tooltip = `${binding.destinationType}\nRouting key: ${binding.routingKey || "(empty)"}`;
		this.command = {
			command: "amqp-manager.inspectBinding",
			title: "Inspect Binding",
			arguments: [binding],
		};
	}
}

/**
 * Coordinates native VS Code views so saved connections are always rendered
 * independently from broker resource and health loading.
 */
export class RabbitMqExplorer implements vscode.Disposable {
	private readonly bindingsProvider = new BindingsProvider(this);
	private readonly connectionsProvider = new ConnectionsProvider(this);
	private readonly exchangesProvider = new ExchangesProvider(this);
	private readonly queuesProvider = new QueuesProvider(this);
	private readonly disposables: vscode.Disposable[] = [];
	private readonly statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100,
	);

	private bindingsView: vscode.TreeView<BindingNode | EmptyNode> | undefined;
	private connectionsView:
		| vscode.TreeView<ConnectionNode | EmptyNode>
		| undefined;
	private exchangesView: vscode.TreeView<ExchangeNode | EmptyNode> | undefined;
	private queuesView: vscode.TreeView<QueueNode | EmptyNode> | undefined;

	private activeConnection: ConnectionSummary | undefined;
	private connectionSummaries: ConnectionSummary[] = [];
	private health: ConnectionHealth | undefined;
	private resources: ResourceSnapshot | undefined;
	private resourceLoadError: string | undefined;

	constructor(private readonly dependencies: ExplorerDependencies) {
		this.statusBarItem.command = "amqp-manager.openPanel";
		this.statusBarItem.name = "AMQP Manager";
		this.disposables.push(this.statusBarItem);
	}

	/**
	 * Registers the tree views and triggers the first native-state refresh.
	 */
	register(context: vscode.ExtensionContext): void {
		this.connectionsView = vscode.window.createTreeView(CONNECTIONS_VIEW_ID, {
			treeDataProvider: this.connectionsProvider,
			showCollapseAll: false,
		});
		this.queuesView = vscode.window.createTreeView(QUEUES_VIEW_ID, {
			treeDataProvider: this.queuesProvider,
			showCollapseAll: false,
		});
		this.exchangesView = vscode.window.createTreeView(EXCHANGES_VIEW_ID, {
			treeDataProvider: this.exchangesProvider,
			showCollapseAll: false,
		});
		this.bindingsView = vscode.window.createTreeView(BINDINGS_VIEW_ID, {
			treeDataProvider: this.bindingsProvider,
			showCollapseAll: false,
		});

		context.subscriptions.push(
			this.connectionsView,
			this.queuesView,
			this.exchangesView,
			this.bindingsView,
			this,
		);

		this.disposables.push(
			this.connectionsView.onDidChangeVisibility((event) => {
				if (event.visible) {
					void this.refreshConnections();
				}
			}),
			this.queuesView.onDidChangeVisibility((event) => {
				if (event.visible) {
					void this.refreshResources();
				}
			}),
			this.exchangesView.onDidChangeVisibility((event) => {
				if (event.visible) {
					void this.refreshResources();
				}
			}),
			this.bindingsView.onDidChangeVisibility((event) => {
				if (event.visible) {
					void this.refreshResources();
				}
			}),
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (
					event.affectsConfiguration("amqp-manager") ||
					event.affectsConfiguration("rabbitmq")
				) {
					void this.refresh();
				}
			}),
		);

		void this.refresh().catch((error) => {
			const message =
				error instanceof Error
					? error.message
					: "Failed to initialize the AMQP Manager explorer.";
			vscode.window.showErrorMessage(message);
		});
	}

	dispose(): void {
		vscode.Disposable.from(...this.disposables).dispose();
	}

	async focus(): Promise<void> {
		await vscode.commands.executeCommand(
			`workbench.view.extension.${VIEW_CONTAINER_ID}`,
		);
		await this.refresh();
	}

	/**
	 * Performs a full native refresh in two phases: saved connections first,
	 * then broker-dependent resources and health.
	 */
	async refresh(): Promise<void> {
		await this.refreshConnections();
		await this.refreshResources();
	}

	async addConnection(): Promise<void> {
		const added = await this.dependencies.connectionCommands.addConnection();
		if (!added) {
			return;
		}

		await this.refreshConnections();
		await this.focus();
		await this.refreshResources();
	}

	async editConnection(node?: ConnectionNode): Promise<void> {
		await this.dependencies.connectionCommands.editConnection(
			node?.connection.id,
		);
		await this.refreshConnections();
		await this.refreshResources();
	}

	async removeConnection(node?: ConnectionNode): Promise<void> {
		await this.dependencies.connectionCommands.removeConnection(
			node?.connection.id,
		);
		await this.refreshConnections();
		await this.refreshResources();
	}

	async setActiveConnection(
		nodeOrId: ConnectionNode | ConnectionSummary | string,
	): Promise<void> {
		const connectionId =
			typeof nodeOrId === "string"
				? nodeOrId
				: "connection" in nodeOrId
					? nodeOrId.connection.id
					: nodeOrId.id;
		await this.dependencies.connectionStore.setActiveConnection(connectionId);
		await this.refreshConnections();
		await this.refreshResources();
	}

	async testActiveConnection(node?: ConnectionNode): Promise<void> {
		const connectionId = node?.connection.id ?? this.activeConnection?.id;
		if (!connectionId) {
			vscode.window.showWarningMessage("No active connection to test.");
			return;
		}

		await this.refreshHealth(connectionId, true);
		this.updateStatusBar();
		this.connectionsProvider.refresh();
	}

	async createQueue(): Promise<void> {
		const input = await this.dependencies.resourceInputService.promptQueue();
		if (!input) {
			return;
		}

		await this.dependencies.rabbitMqAdminService.createQueue(input);
		await this.refreshResources();
	}

	async editQueue(node: QueueNode): Promise<void> {
		const details = await this.dependencies.rabbitMqAdminService.getQueue(
			node.queue.name,
		);
		const input =
			await this.dependencies.resourceInputService.promptQueue(details);
		if (!input) {
			return;
		}

		await this.dependencies.rabbitMqAdminService.updateQueue(input);
		await this.refreshResources();
	}

	async deleteQueue(node: QueueNode): Promise<void> {
		await this.confirmDestructive(`Delete queue "${node.queue.name}"?`);
		await this.dependencies.rabbitMqAdminService.deleteQueue(node.queue.name);
		await this.refreshResources();
	}

	async purgeQueue(node: QueueNode): Promise<void> {
		await this.confirmDestructive(`Purge queue "${node.queue.name}"?`);
		await this.dependencies.rabbitMqAdminService.purgeQueue(node.queue.name);
		await this.refreshResources();
	}

	async listQueueMessages(
		nodeOrQueue: QueueNode | QueueDetails,
	): Promise<void> {
		const queue = "queue" in nodeOrQueue ? nodeOrQueue.queue : nodeOrQueue;
		const details = await this.dependencies.rabbitMqAdminService.getQueue(
			queue.name,
		);
		const unackedMessages = details.unackedMessages ?? 0;

		if (unackedMessages > 0) {
			vscode.window.showWarningMessage(
				`Queue "${queue.name}" has ${unackedMessages} unacked message(s). Listing all messages is only available when no consumer is holding messages.`,
			);
			return;
		}

		const readyMessages = details.readyMessages ?? details.messages ?? 0;
		if (readyMessages <= 0) {
			vscode.window.showInformationMessage(
				`Queue "${queue.name}" has no ready messages to list.`,
			);
			return;
		}

		const messages =
			await this.dependencies.rabbitMqAdminService.listQueueMessages(
				queue.name,
				readyMessages,
			);
		await this.openJsonDocument(
			this.createQueueMessagesDocument(details, messages),
		);
	}

	async publishQueue(nodeOrQueue: QueueNode | QueueDetails): Promise<void> {
		const queue = "queue" in nodeOrQueue ? nodeOrQueue.queue : nodeOrQueue;
		const input =
			await this.dependencies.resourceInputService.promptQueuePublish(queue);
		if (!input) {
			return;
		}

		const routed =
			await this.dependencies.rabbitMqAdminService.publishMessage(input);
		await this.refreshResources();
		if (routed) {
			vscode.window.showInformationMessage(
				`Message published to queue "${queue.name}".`,
			);
			return;
		}

		vscode.window.showWarningMessage(
			`Message sent to queue "${queue.name}", but the broker reported that it was not routed.`,
		);
	}

	async createExchange(): Promise<void> {
		const input = await this.dependencies.resourceInputService.promptExchange();
		if (!input) {
			return;
		}

		await this.dependencies.rabbitMqAdminService.createExchange(input);
		await this.refreshResources();
	}

	async editExchange(node: ExchangeNode): Promise<void> {
		const details = await this.dependencies.rabbitMqAdminService.getExchange(
			node.exchange.name,
		);
		const input =
			await this.dependencies.resourceInputService.promptExchange(details);
		if (!input) {
			return;
		}

		await this.dependencies.rabbitMqAdminService.updateExchange(input);
		await this.refreshResources();
	}

	async deleteExchange(node: ExchangeNode): Promise<void> {
		await this.confirmDestructive(
			`Delete exchange "${node.exchange.name || "(default)"}"?`,
		);
		await this.dependencies.rabbitMqAdminService.deleteExchange(
			node.exchange.name,
		);
		await this.refreshResources();
	}

	async publishExchange(
		nodeOrExchange: ExchangeNode | ExchangeDetails,
	): Promise<void> {
		const exchange =
			"exchange" in nodeOrExchange ? nodeOrExchange.exchange : nodeOrExchange;
		const input =
			await this.dependencies.resourceInputService.promptExchangePublish(
				exchange,
			);
		if (!input) {
			return;
		}

		const routed =
			await this.dependencies.rabbitMqAdminService.publishMessage(input);
		await this.refreshResources();
		if (routed) {
			vscode.window.showInformationMessage(
				`Message published to exchange "${exchange.name || "(default)"}".`,
			);
			return;
		}

		vscode.window.showWarningMessage(
			`Message published to exchange "${exchange.name || "(default)"}", but the broker reported that it was not routed.`,
		);
	}

	async createBinding(): Promise<void> {
		const input = await this.dependencies.resourceInputService.promptBinding();
		if (!input) {
			return;
		}

		await this.dependencies.rabbitMqAdminService.createBinding(input);
		await this.refreshResources();
	}

	async deleteBinding(node: BindingNode): Promise<void> {
		await this.confirmDestructive(
			`Delete binding "${node.binding.source}" -> "${node.binding.destination}"?`,
		);
		await this.dependencies.rabbitMqAdminService.deleteBinding(node.binding);
		await this.refreshResources();
	}

	async inspectQueue(nodeOrQueue: QueueNode | QueueDetails): Promise<void> {
		const queue = "queue" in nodeOrQueue ? nodeOrQueue.queue : nodeOrQueue;
		const details = await this.dependencies.rabbitMqAdminService.getQueue(
			queue.name,
		);
		if (this.dependencies.resourceEditor) {
			await this.dependencies.resourceEditor.openQueue(
				details,
				this.activeConnection?.id,
			);
			return;
		}
		await this.openJsonDocument(details);
	}

	async inspectExchange(
		nodeOrExchange: ExchangeNode | ExchangeDetails,
	): Promise<void> {
		const exchange =
			"exchange" in nodeOrExchange ? nodeOrExchange.exchange : nodeOrExchange;
		const details = await this.dependencies.rabbitMqAdminService.getExchange(
			exchange.name,
		);
		if (this.dependencies.resourceEditor) {
			await this.dependencies.resourceEditor.openExchange(
				details,
				this.activeConnection?.id,
			);
			return;
		}
		await this.openJsonDocument(details);
	}

	async inspectBinding(
		nodeOrBinding: BindingNode | BindingDetails,
	): Promise<void> {
		await this.openJsonDocument(
			"binding" in nodeOrBinding ? nodeOrBinding.binding : nodeOrBinding,
		);
	}

	async getConnectionNodes(): Promise<Array<ConnectionNode | EmptyNode>> {
		if (this.connectionSummaries.length === 0) {
			return [
				new EmptyNode(
					"No Connections",
					"Use the add action to configure one.",
					{
						command: "amqp-manager.addConnection",
						title: "Add AMQP Connection",
					},
				),
			];
		}

		return this.connectionSummaries.map(
			(connection) =>
				new ConnectionNode(
					connection,
					connection.id === this.activeConnection?.id,
					connection.id === this.health?.connectionId ? this.health : undefined,
				),
		);
	}

	async getQueueNodes(): Promise<Array<QueueNode | EmptyNode>> {
		if (!this.activeConnection) {
			return [this.createInactiveResourceNode("queue")];
		}
		if (this.resourceLoadError) {
			return [new EmptyNode("Queues unavailable", this.resourceLoadError)];
		}

		if (!this.resources?.queues.length) {
			return [
				new EmptyNode("No Queues", "Create a queue from the title action."),
			];
		}

		return this.resources.queues
			.slice()
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((queue) => new QueueNode(queue));
	}

	async getExchangeNodes(): Promise<Array<ExchangeNode | EmptyNode>> {
		if (!this.activeConnection) {
			return [this.createInactiveResourceNode("exchange")];
		}
		if (this.resourceLoadError) {
			return [new EmptyNode("Exchanges unavailable", this.resourceLoadError)];
		}

		if (!this.resources?.exchanges.length) {
			return [
				new EmptyNode(
					"No Exchanges",
					"Create an exchange from the title action.",
				),
			];
		}

		return this.resources.exchanges
			.slice()
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((exchange) => new ExchangeNode(exchange));
	}

	async getBindingNodes(): Promise<Array<BindingNode | EmptyNode>> {
		if (!this.activeConnection) {
			return [this.createInactiveResourceNode("binding")];
		}
		if (this.resourceLoadError) {
			return [new EmptyNode("Bindings unavailable", this.resourceLoadError)];
		}

		if (!this.resources?.bindings.length) {
			return [
				new EmptyNode("No Bindings", "Create a binding from the title action."),
			];
		}

		return this.resources.bindings
			.slice()
			.sort((left, right) =>
				`${left.source}:${left.destination}`.localeCompare(
					`${right.source}:${right.destination}`,
				),
			)
			.map((binding) => new BindingNode(binding));
	}

	/**
	 * Loads saved connection metadata only and updates the connection tree
	 * even when the broker is down or the active connection becomes stale.
	 */
	private async refreshConnections(): Promise<void> {
		this.connectionSummaries =
			await this.dependencies.connectionStore.listSummaries();
		const activeConnectionId =
			await this.dependencies.connectionStore.getActiveConnectionId();
		this.activeConnection =
			this.connectionSummaries.find(
				(connection) => connection.id === activeConnectionId,
			) ?? undefined;

		if (!this.activeConnection && activeConnectionId) {
			await this.dependencies.connectionStore.clearActiveConnection();
		}

		if (this.connectionsView) {
			this.connectionsView.message =
				this.connectionSummaries.length === 0
					? "Save an AMQP connection to start exploring brokers."
					: undefined;
			this.connectionsView.description = this.activeConnection
				? `Active: ${this.activeConnection.name}`
				: this.connectionSummaries.length > 0
					? "Choose a connection"
					: undefined;
		}
		await this.setContextFlags(
			Boolean(this.activeConnection),
			this.connectionSummaries.length > 0,
		);
		this.connectionsProvider.refresh();
		this.updateStatusBar();
	}

	/**
	 * Loads queues, exchanges, bindings, and connection health for the current
	 * active connection without blocking the saved-connections view.
	 */
	private async refreshResources(): Promise<void> {
		this.health = undefined;
		this.resourceLoadError = undefined;
		this.resources = undefined;

		if (!this.activeConnection) {
			this.updateInactiveResourceViews();
			this.refreshResourceProviders();
			this.updateStatusBar();
			return;
		}

		try {
			this.resources =
				await this.dependencies.rabbitMqAdminService.listResources(
					this.activeConnection.id,
				);
		} catch (error) {
			this.resourceLoadError =
				error instanceof Error
					? error.message
					: "Failed to refresh broker resources.";
			this.updateResourceMessages(this.resourceLoadError);
			this.refreshResourceProviders();
			this.updateStatusBar();
			vscode.window.showErrorMessage(this.resourceLoadError);
			return;
		}

		await this.refreshHealth(this.activeConnection.id);
		this.updateResourceMessages(undefined);
		this.refreshResourceProviders();
		this.connectionsProvider.refresh();
		this.updateStatusBar();
	}

	private refreshResourceProviders(): void {
		this.queuesProvider.refresh();
		this.exchangesProvider.refresh();
		this.bindingsProvider.refresh();
	}

	private updateInactiveResourceViews(): void {
		const message =
			this.connectionSummaries.length === 0
				? "Add a connection to load broker resources."
				: "Select an active connection in the Connections view.";
		this.updateResourceMessages(message);
	}

	private updateResourceMessages(message: string | undefined): void {
		if (this.queuesView) {
			this.queuesView.message = message;
		}
		if (this.exchangesView) {
			this.exchangesView.message = message;
		}
		if (this.bindingsView) {
			this.bindingsView.message = message;
		}
	}

	/**
	 * Runs the HTTP management and AMQP probes used by the native explorer status.
	 */
	private async refreshHealth(
		connectionId: string,
		showMessage = false,
	): Promise<void> {
		this.health = await this.dependencies.rabbitMqAdminService
			.testConnection(connectionId)
			.catch((error) => ({
				connectionId,
				management: {
					ok: false,
					message:
						error instanceof Error
							? error.message
							: "Management API probe failed.",
				},
				amqp: {
					ok: false,
					message:
						error instanceof Error ? error.message : "AMQP probe failed.",
				},
				timestamp: new Date().toISOString(),
			}));

		if (showMessage) {
			const state =
				this.health.management.ok && this.health.amqp.ok
					? "is healthy"
					: "reported issues";
			vscode.window.showInformationMessage(`Connection ${state}.`);
		}
	}

	private updateStatusBar(): void {
		if (!this.activeConnection) {
			this.statusBarItem.text =
				this.connectionSummaries.length === 0
					? "$(plug) AMQP Manager: add connection"
					: "$(warning) AMQP Manager: select connection";
			this.statusBarItem.tooltip =
				this.connectionSummaries.length === 0
					? "Save an AMQP connection."
					: "Select an active connection in the Connections view.";
			this.statusBarItem.show();
			return;
		}

		const isHealthy =
			this.health?.connectionId === this.activeConnection.id &&
			this.health.management.ok &&
			this.health.amqp.ok;
		const hasHealth = this.health?.connectionId === this.activeConnection.id;
		const icon = hasHealth
			? isHealthy
				? "$(check)"
				: "$(warning)"
			: "$(sync)";
		const status = hasHealth
			? isHealthy
				? "healthy"
				: "attention"
			: "loading";
		this.statusBarItem.text = `${icon} AMQP Manager: ${this.activeConnection.name}`;
		this.statusBarItem.tooltip = [
			this.activeConnection.managementUrl,
			`Status: ${status}`,
			this.resourceLoadError ?? "Native explorer is synchronized.",
		].join("\n");
		this.statusBarItem.show();
	}

	private createInactiveResourceNode(resourceLabel: string): EmptyNode {
		if (this.connectionSummaries.length === 0) {
			return new EmptyNode(
				`No ${capitalize(resourceLabel)}s`,
				"Add a connection first.",
				{
					command: "amqp-manager.addConnection",
					title: "Add AMQP Connection",
				},
			);
		}

		return new EmptyNode(
			`No Active ${capitalize(resourceLabel)} Context`,
			"Select a connection in the Connections view first.",
		);
	}

	private async openJsonDocument(content: unknown): Promise<void> {
		const document = await vscode.workspace.openTextDocument({
			language: "json",
			content: JSON.stringify(content, null, 2),
		});
		await vscode.window.showTextDocument(document, {
			preview: true,
			viewColumn: vscode.ViewColumn.Beside,
		});
	}

	private createQueueMessagesDocument(
		queue: QueueDetails,
		messages: QueueMessageDetails[],
	): Record<string, unknown> {
		return {
			queue: {
				name: queue.name,
				vhost: queue.vhost,
				messages: queue.messages ?? messages.length,
				readyMessages: queue.readyMessages ?? messages.length,
				unackedMessages: queue.unackedMessages ?? 0,
			},
			listedAt: new Date().toISOString(),
			messageCount: messages.length,
			messages,
		};
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

	private async setContextFlags(
		hasActiveConnection: boolean,
		hasConnections: boolean,
	): Promise<void> {
		await vscode.commands.executeCommand(
			"setContext",
			"amqp-manager.hasActiveConnection",
			hasActiveConnection,
		);
		await vscode.commands.executeCommand(
			"setContext",
			"amqp-manager.hasConnections",
			hasConnections,
		);
	}
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

export type { BindingNode, ConnectionNode, ExchangeNode, QueueNode };

function createThemeIcon(id: string, colorId?: string): vscode.ThemeIcon {
	const ThemeIconConstructor = vscode.ThemeIcon as unknown as {
		new (iconId: string, color?: vscode.ThemeColor): vscode.ThemeIcon;
	};
	const ThemeColorConstructor = vscode.ThemeColor as unknown as {
		new (colorId: string): vscode.ThemeColor;
	};

	return new ThemeIconConstructor(
		id,
		colorId ? new ThemeColorConstructor(colorId) : undefined,
	);
}
