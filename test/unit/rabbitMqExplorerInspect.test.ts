import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

const openTextDocument = mock(async () => ({}));
const showTextDocument = mock(async () => undefined);

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
		showTextDocument,
	},
	workspace: {
		getConfiguration: () => ({
			get: <T>(_key: string, defaultValue: T) => defaultValue,
		}),
		openTextDocument,
	},
}));

type RabbitMqExplorerModule =
	typeof import("../../src/ui/views/rabbitMqExplorer.js");
type InspectExplorer = {
	inspectQueue(queue: Record<string, unknown>): Promise<void>;
	inspectExchange(exchange: Record<string, unknown>): Promise<void>;
};

let RabbitMqExplorer: RabbitMqExplorerModule["RabbitMqExplorer"];

beforeAll(async () => {
	({ RabbitMqExplorer } = await import(
		"../../src/ui/views/rabbitMqExplorer.js"
	));
});

beforeEach(() => {
	openTextDocument.mockClear();
	showTextDocument.mockClear();
});

describe("rabbitMqExplorer inspect actions", () => {
	it("opens the queue resource editor instead of a JSON document when available", async () => {
		const queue = {
			id: "queue-1",
			name: "jobs",
			vhost: "/",
			durable: true,
			autoDelete: false,
			exclusive: false,
			arguments: {},
		};
		const getQueue = mock(async () => queue);
		const openQueue = mock(async () => undefined);
		const explorer = new RabbitMqExplorer({
			connectionCommands: {} as never,
			connectionStore: {} as never,
			rabbitMqAdminService: { getQueue } as never,
			resourceEditor: { openQueue } as never,
			resourceInputService: {} as never,
		}) as unknown as InspectExplorer;

		await explorer.inspectQueue(queue);

		expect(getQueue).toHaveBeenCalledWith("jobs");
		expect(openQueue).toHaveBeenCalledWith(queue, undefined);
		expect(openTextDocument).not.toHaveBeenCalled();
		expect(showTextDocument).not.toHaveBeenCalled();
	});

	it("opens the exchange resource editor instead of a JSON document when available", async () => {
		const exchange = {
			id: "exchange-1",
			name: "events",
			vhost: "/",
			type: "topic",
			durable: true,
			autoDelete: false,
			internal: false,
			arguments: {},
		};
		const getExchange = mock(async () => exchange);
		const openExchange = mock(async () => undefined);
		const explorer = new RabbitMqExplorer({
			connectionCommands: {} as never,
			connectionStore: {} as never,
			rabbitMqAdminService: { getExchange } as never,
			resourceEditor: { openExchange } as never,
			resourceInputService: {} as never,
		}) as unknown as InspectExplorer;

		await explorer.inspectExchange(exchange);

		expect(getExchange).toHaveBeenCalledWith("events");
		expect(openExchange).toHaveBeenCalledWith(exchange, undefined);
		expect(openTextDocument).not.toHaveBeenCalled();
		expect(showTextDocument).not.toHaveBeenCalled();
	});
});
