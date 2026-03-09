import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

const openTextDocument = mock(async () => ({ uri: "memory:queue-messages" }));
const showInformationMessage = mock(async () => undefined);
const showTextDocument = mock(async () => undefined);
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
		showTextDocument,
		showWarningMessage,
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
type QueueTarget = {
	id: string;
	name: string;
	vhost: string;
	durable: boolean;
	autoDelete: boolean;
	exclusive: boolean;
	arguments: Record<string, unknown>;
	messages?: number;
	readyMessages?: number;
	unackedMessages?: number;
};
type QueueMessageExplorer = {
	listQueueMessages: (queue: QueueTarget) => Promise<void>;
};

let RabbitMqExplorer: RabbitMqExplorerModule["RabbitMqExplorer"];

beforeAll(async () => {
	({ RabbitMqExplorer } = await import(
		"../../src/ui/views/rabbitMqExplorer.js"
	));
});

beforeEach(() => {
	openTextDocument.mockClear();
	showInformationMessage.mockClear();
	showTextDocument.mockClear();
	showWarningMessage.mockClear();
});

describe("rabbitMqExplorer list queue messages", () => {
	it("warns when the queue contains unacked messages", async () => {
		const queue: QueueTarget = {
			id: "queue-1",
			name: "jobs",
			vhost: "/",
			durable: true,
			autoDelete: false,
			exclusive: false,
			arguments: {},
		};
		const getQueue = mock(async () => ({
			...queue,
			messages: 5,
			readyMessages: 2,
			unackedMessages: 3,
		}));
		const listQueueMessages = mock(async () => []);
		const explorer = new RabbitMqExplorer({
			connectionCommands: {} as never,
			connectionStore: {} as never,
			rabbitMqAdminService: { getQueue, listQueueMessages } as never,
			resourceInputService: {} as never,
		}) as unknown as QueueMessageExplorer;

		await explorer.listQueueMessages(queue);

		expect(getQueue).toHaveBeenCalledWith("jobs");
		expect(listQueueMessages).not.toHaveBeenCalled();
		expect(showWarningMessage).toHaveBeenCalledWith(
			'Queue "jobs" has 3 unacked message(s). Listing all messages is only available when no consumer is holding messages.',
		);
		expect(openTextDocument).not.toHaveBeenCalled();
	});

	it("opens a JSON document with all ready messages when none are unacked", async () => {
		const queue: QueueTarget = {
			id: "queue-1",
			name: "jobs",
			vhost: "/",
			durable: true,
			autoDelete: false,
			exclusive: false,
			arguments: {},
		};
		const listedMessages = [
			{
				payload: '{"job":"sync"}',
				payloadBytes: 14,
				payloadEncoding: "string",
				redelivered: false,
				exchange: "",
				routingKey: "jobs",
				messageCount: 0,
				properties: {},
			},
		];
		const getQueue = mock(async () => ({
			...queue,
			messages: 1,
			readyMessages: 1,
			unackedMessages: 0,
		}));
		const listQueueMessages = mock(async () => listedMessages);
		const explorer = new RabbitMqExplorer({
			connectionCommands: {} as never,
			connectionStore: {} as never,
			rabbitMqAdminService: { getQueue, listQueueMessages } as never,
			resourceInputService: {} as never,
		}) as unknown as QueueMessageExplorer;

		await explorer.listQueueMessages(queue);

		expect(getQueue).toHaveBeenCalledWith("jobs");
		expect(listQueueMessages).toHaveBeenCalledWith("jobs", 1);
		expect(openTextDocument).toHaveBeenCalledTimes(1);
		expect(openTextDocument.mock.calls[0].at(0)).toMatchObject({
			language: "json",
		});
		// @ts-expect-error
		expect(openTextDocument.mock.calls[0]?.at(0)?.content).toContain(
			'"messageCount": 1',
		);
		// @ts-expect-error
		expect(openTextDocument.mock.calls[0]?.at(0)?.content).toContain(
			'"payload": "{\\"job\\":\\"sync\\"}"',
		);
		expect(showTextDocument).toHaveBeenCalledTimes(1);
		expect(showWarningMessage).not.toHaveBeenCalled();
	});
});
