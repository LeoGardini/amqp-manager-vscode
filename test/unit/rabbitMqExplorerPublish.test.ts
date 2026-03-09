import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

const showInformationMessage = mock(async () => undefined);
const showWarningMessage = mock(async () => undefined);

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
	ThemeColor: class FakeThemeColor {
		constructor(readonly id: string) {}
	},
	ThemeIcon: class FakeThemeIcon {
		constructor(
			readonly id: string,
			readonly color?: unknown,
		) {}
	},
	TreeItem: class FakeTreeItem {
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
	},
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
		showInformationMessage,
		showWarningMessage,
	},
	workspace: {
		getConfiguration: () => ({
			get: <T>(_key: string, defaultValue: T) => defaultValue,
		}),
	},
}));

type RabbitMqExplorerModule =
	typeof import("../../src/ui/views/rabbitMqExplorer.js");
type PublishableQueue = {
	id: string;
	name: string;
	vhost: string;
	durable: boolean;
	autoDelete: boolean;
	exclusive: boolean;
	arguments: Record<string, unknown>;
};
type PublishableExchange = {
	id: string;
	name: string;
	vhost: string;
	type: string;
	durable: boolean;
	autoDelete: boolean;
	internal: boolean;
	arguments: Record<string, unknown>;
};
type QueuePublishExplorer = {
	publishQueue: (queue: PublishableQueue) => Promise<void>;
	refreshResources: () => Promise<void>;
};
type ExchangePublishExplorer = {
	publishExchange: (exchange: PublishableExchange) => Promise<void>;
	refreshResources: () => Promise<void>;
};

let RabbitMqExplorer: RabbitMqExplorerModule["RabbitMqExplorer"];

beforeAll(async () => {
	({ RabbitMqExplorer } = await import(
		"../../src/ui/views/rabbitMqExplorer.js"
	));
});

beforeEach(() => {
	showInformationMessage.mockClear();
	showWarningMessage.mockClear();
});

describe("rabbitMqExplorer publish actions", () => {
	it("publishes a message from a queue action and refreshes resources", async () => {
		const queue: PublishableQueue = {
			id: "queue-1",
			name: "jobs",
			vhost: "/",
			durable: true,
			autoDelete: false,
			exclusive: false,
			arguments: {},
		};
		const publishInput = {
			exchange: "",
			routingKey: "jobs",
			payload: '{"job":"sync"}',
			properties: {},
		};
		const promptQueuePublish = mock(async () => publishInput);
		const publishMessage = mock(async () => true);
		const explorer = new RabbitMqExplorer({
			connectionCommands: {} as never,
			connectionStore: {} as never,
			rabbitMqAdminService: { publishMessage } as never,
			resourceInputService: { promptQueuePublish } as never,
		}) as unknown as QueuePublishExplorer;
		const refreshResources = mock(async () => undefined);
		explorer.refreshResources = refreshResources;

		await explorer.publishQueue(queue);

		expect(promptQueuePublish).toHaveBeenCalledWith(queue);
		expect(publishMessage).toHaveBeenCalledWith(publishInput);
		expect(refreshResources).toHaveBeenCalledTimes(1);
		expect(showInformationMessage).toHaveBeenCalledWith(
			'Message published to queue "jobs".',
		);
	});

	it("shows a warning when an exchange publish is not routed", async () => {
		const exchange: PublishableExchange = {
			id: "exchange-1",
			name: "events",
			vhost: "/",
			type: "topic",
			durable: true,
			autoDelete: false,
			internal: false,
			arguments: {},
		};
		const publishInput = {
			exchange: "events",
			routingKey: "jobs.created",
			payload: '{"job":"sync"}',
			properties: {},
		};
		const promptExchangePublish = mock(async () => publishInput);
		const publishMessage = mock(async () => false);
		const explorer = new RabbitMqExplorer({
			connectionCommands: {} as never,
			connectionStore: {} as never,
			rabbitMqAdminService: { publishMessage } as never,
			resourceInputService: { promptExchangePublish } as never,
		}) as unknown as ExchangePublishExplorer;
		const refreshResources = mock(async () => undefined);
		explorer.refreshResources = refreshResources;

		await explorer.publishExchange(exchange);

		expect(promptExchangePublish).toHaveBeenCalledWith(exchange);
		expect(publishMessage).toHaveBeenCalledWith(publishInput);
		expect(refreshResources).toHaveBeenCalledTimes(1);
		expect(showWarningMessage).toHaveBeenCalledWith(
			'Message published to exchange "events", but the broker reported that it was not routed.',
		);
	});
});
