import { beforeAll, describe, expect, it, mock } from "bun:test";

class FakeDisposable {
	dispose(): void {}

	static from(...disposables: Array<{ dispose(): void }>): FakeDisposable {
		return {
			dispose() {
				for (const disposable of disposables) {
					disposable.dispose();
				}
			},
		} as FakeDisposable;
	}
}

class FakeThemeIcon {
	constructor(
		readonly id: string,
		readonly color?: FakeThemeColor,
	) {}
}

class FakeThemeColor {
	constructor(readonly id: string) {}
}

class FakeTreeItem {
	id?: string;
	description?: string;
	contextValue?: string;
	iconPath?: unknown;
	tooltip?: string;
	command?: unknown;

	constructor(
		readonly label: string,
		readonly collapsibleState: number,
	) {}
}

class FakeEventEmitter<T> {
	readonly event = () => new FakeDisposable();

	fire(_value?: T | undefined | null): void {}
}

class FakeStatusBarItem extends FakeDisposable {
	command?: string;
	name?: string;
	text?: string;
	tooltip?: string;

	show(): void {}
}

mock.module("vscode", () => ({
	Disposable: FakeDisposable,
	EventEmitter: FakeEventEmitter,
	StatusBarAlignment: {
		Left: 1,
	},
	ThemeIcon: FakeThemeIcon,
	ThemeColor: FakeThemeColor,
	TreeItem: FakeTreeItem,
	TreeItemCollapsibleState: {
		None: 0,
	},
	ViewColumn: {
		Beside: 2,
	},
	commands: {
		executeCommand: async () => undefined,
	},
	window: {
		createStatusBarItem: () => new FakeStatusBarItem(),
		openTextDocument: async () => ({}),
		showErrorMessage: async () => undefined,
		showInformationMessage: async () => undefined,
		showTextDocument: async () => undefined,
		showWarningMessage: async () => undefined,
	},
	workspace: {
		getConfiguration: () => ({
			get: <T>(_key: string, defaultValue: T) => defaultValue,
		}),
		onDidChangeConfiguration: () => new FakeDisposable(),
		openTextDocument: async () => ({}),
	},
}));

type RabbitMqExplorerModule =
	typeof import("../../src/ui/views/rabbitMqExplorer.js");
type TreeNode = { iconPath?: unknown; label?: string };
type ExplorerHarness = {
	connectionSummaries: Array<Record<string, unknown>>;
	activeConnection?: Record<string, unknown>;
	resources?: Record<string, unknown>;
	getConnectionNodes(): Promise<TreeNode[]>;
	getQueueNodes(): Promise<TreeNode[]>;
	getExchangeNodes(): Promise<TreeNode[]>;
	getBindingNodes(): Promise<TreeNode[]>;
};

let RabbitMqExplorer: RabbitMqExplorerModule["RabbitMqExplorer"];

beforeAll(async () => {
	({ RabbitMqExplorer } = await import(
		"../../src/ui/views/rabbitMqExplorer.js"
	));
});

describe("rabbitMqExplorer tree items", () => {
	it("uses ThemeIcon instances for rendered nodes", async () => {
		const explorer = new RabbitMqExplorer({
			connectionCommands: {} as never,
			connectionStore: {} as never,
			rabbitMqAdminService: {} as never,
			resourceInputService: {} as never,
		}) as unknown as ExplorerHarness;

		const connection = {
			id: "local",
			name: "Local",
			managementUrl: "http://localhost:15672",
			amqpUrl: "amqp://localhost:5672",
			vhost: "/",
			username: "guest",
			tls: false,
			timeoutMs: 10000,
			rejectUnauthorized: false,
			hasSecret: true,
		};
		explorer.connectionSummaries = [connection];
		explorer.activeConnection = connection;
		explorer.resources = {
			queues: [
				{
					id: "queue-1",
					name: "jobs",
					vhost: "/",
					durable: true,
					autoDelete: false,
					exclusive: false,
					arguments: {},
					messages: 2,
				},
			],
			exchanges: [
				{
					id: "exchange-1",
					name: "events",
					vhost: "/",
					type: "topic",
					durable: true,
					autoDelete: false,
					internal: false,
					arguments: {},
				},
			],
			bindings: [
				{
					id: "binding-1",
					vhost: "/",
					source: "events",
					destination: "jobs",
					destinationType: "queue",
					routingKey: "jobs.*",
					arguments: {},
					propertiesKey: "jobs.*",
				},
			],
			lastLoadedAt: new Date().toISOString(),
		};

		const [connectionNode] = await explorer.getConnectionNodes();
		const [queueNode] = await explorer.getQueueNodes();
		const [exchangeNode] = await explorer.getExchangeNodes();
		const [bindingNode] = await explorer.getBindingNodes();

		expect(connectionNode.iconPath).toBeInstanceOf(FakeThemeIcon);
		expect(queueNode.iconPath).toBeInstanceOf(FakeThemeIcon);
		expect(exchangeNode.iconPath).toBeInstanceOf(FakeThemeIcon);
		expect(bindingNode.iconPath).toBeInstanceOf(FakeThemeIcon);
	});

	it("uses AMQP Manager icon semantics and accent color across nodes", async () => {
		const explorer = new RabbitMqExplorer({
			connectionCommands: {} as never,
			connectionStore: {} as never,
			rabbitMqAdminService: {} as never,
			resourceInputService: {} as never,
		}) as unknown as ExplorerHarness;

		const connection = {
			id: "local",
			name: "Local",
			managementUrl: "http://localhost:15672",
			amqpUrl: "amqp://localhost:5672",
			vhost: "/",
			username: "guest",
			tls: false,
			timeoutMs: 10000,
			rejectUnauthorized: false,
			hasSecret: true,
		};
		explorer.connectionSummaries = [connection];
		explorer.activeConnection = connection;
		explorer.resources = {
			queues: [
				{
					id: "queue-1",
					name: "jobs",
					vhost: "/",
					durable: true,
					autoDelete: false,
					exclusive: false,
					arguments: {},
					messages: 2,
				},
			],
			exchanges: [
				{
					id: "exchange-1",
					name: "events",
					vhost: "/",
					type: "topic",
					durable: true,
					autoDelete: false,
					internal: false,
					arguments: {},
				},
			],
			bindings: [
				{
					id: "binding-1",
					vhost: "/",
					source: "events",
					destination: "jobs",
					destinationType: "queue",
					routingKey: "jobs.*",
					arguments: {},
					propertiesKey: "jobs.*",
				},
			],
			lastLoadedAt: new Date().toISOString(),
		};

		const [connectionNode] = await explorer.getConnectionNodes();
		const [queueNode] = await explorer.getQueueNodes();
		const [exchangeNode] = await explorer.getExchangeNodes();
		const [bindingNode] = await explorer.getBindingNodes();

		expect(connectionNode.iconPath).toMatchObject({
			id: "vm-active",
			color: { id: "charts.orange" },
		});
		expect(queueNode.iconPath).toMatchObject({
			id: "list-tree",
			color: { id: "charts.orange" },
		});
		expect(exchangeNode.iconPath).toMatchObject({
			id: "organization",
			color: { id: "charts.orange" },
		});
		expect(bindingNode.iconPath).toMatchObject({
			id: "references",
			color: { id: "charts.orange" },
		});
	});

	it("materializes visible empty-state nodes with valid icons", async () => {
		const explorer = new RabbitMqExplorer({
			connectionCommands: {} as never,
			connectionStore: {} as never,
			rabbitMqAdminService: {} as never,
			resourceInputService: {} as never,
		}) as unknown as ExplorerHarness;

		const connection = {
			id: "local",
			name: "Local",
			managementUrl: "http://localhost:15672",
			amqpUrl: "amqp://localhost:5672",
			vhost: "/",
			username: "guest",
			tls: false,
			timeoutMs: 10000,
			rejectUnauthorized: false,
			hasSecret: true,
		};
		explorer.connectionSummaries = [connection];
		explorer.activeConnection = connection;
		explorer.resources = {
			queues: [],
			exchanges: [],
			bindings: [],
			lastLoadedAt: new Date().toISOString(),
		};

		const [emptyQueueNode] = await explorer.getQueueNodes();

		expect(emptyQueueNode.label).toBe("No Queues");
		expect(emptyQueueNode.iconPath).toBeInstanceOf(FakeThemeIcon);
		expect(emptyQueueNode.iconPath).toMatchObject({
			id: "info",
			color: { id: "descriptionForeground" },
		});
	});
});
