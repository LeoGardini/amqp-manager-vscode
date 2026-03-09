import * as vscode from "vscode";

import {
	parseArgumentsText,
	stripExchangeArguments,
	stripQueueArguments,
} from "../rabbitmqArguments";
import type {
	BindingDestinationType,
	BindingInput,
	ExchangeDetails,
	ExchangeInput,
	PublishMessageInput,
	QueueDetails,
	QueueInput,
} from "../types/rabbitmq";

export class ResourceInputService {
	/**
	 * Collects the queue fields required by the native queue CRUD flow.
	 */
	async promptQueue(existing?: QueueDetails): Promise<QueueInput | undefined> {
		const name = existing
			? existing.name
			: await this.promptText("Queue name", "", true);
		if (!name) {
			return undefined;
		}

		const durable = await this.pickBoolean(
			"Queue durable?",
			existing?.durable ?? true,
		);
		if (durable === undefined) {
			return undefined;
		}

		const autoDelete = await this.pickBoolean(
			"Queue auto-delete?",
			existing?.autoDelete ?? false,
		);
		if (autoDelete === undefined) {
			return undefined;
		}

		const exclusive = await this.pickBoolean(
			"Queue exclusive?",
			existing?.exclusive ?? false,
		);
		if (exclusive === undefined) {
			return undefined;
		}

		const deadLetterExchange = await this.promptText(
			"Dead letter exchange",
			this.stringArgument(existing?.arguments["x-dead-letter-exchange"]),
		);
		if (deadLetterExchange === undefined) {
			return undefined;
		}

		const deadLetterRoutingKey = await this.promptText(
			"Dead letter routing key",
			this.stringArgument(existing?.arguments["x-dead-letter-routing-key"]),
		);
		if (deadLetterRoutingKey === undefined) {
			return undefined;
		}

		const messageTtl = await this.promptText(
			"Message TTL (ms)",
			this.numberArgument(existing?.arguments["x-message-ttl"]),
		);
		if (messageTtl === undefined) {
			return undefined;
		}

		const argumentsText = await this.promptText(
			"Extra queue arguments as JSON",
			JSON.stringify(stripQueueArguments(existing?.arguments ?? {})),
		);
		if (argumentsText === undefined) {
			return undefined;
		}

		return {
			name,
			durable,
			autoDelete,
			exclusive,
			deadLetterExchange: this.normalizeOptional(deadLetterExchange),
			deadLetterRoutingKey: this.normalizeOptional(deadLetterRoutingKey),
			messageTtl: this.normalizeNumber(messageTtl),
			arguments: parseArgumentsText(argumentsText),
		};
	}

	/**
	 * Collects the exchange fields required by the native exchange CRUD flow.
	 */
	async promptExchange(
		existing?: ExchangeDetails,
	): Promise<ExchangeInput | undefined> {
		const name = existing
			? existing.name
			: await this.promptText("Exchange name", "", true);
		if (name === undefined) {
			return undefined;
		}

		const type = await vscode.window.showQuickPick(
			["direct", "topic", "fanout", "headers", "x-delayed-message"],
			{
				title: "Exchange type",
				ignoreFocusOut: true,
				placeHolder: existing?.type ?? "direct",
			},
		);
		if (!type) {
			return undefined;
		}

		const durable = await this.pickBoolean(
			"Exchange durable?",
			existing?.durable ?? true,
		);
		if (durable === undefined) {
			return undefined;
		}

		const autoDelete = await this.pickBoolean(
			"Exchange auto-delete?",
			existing?.autoDelete ?? false,
		);
		if (autoDelete === undefined) {
			return undefined;
		}

		const internal = await this.pickBoolean(
			"Exchange internal?",
			existing?.internal ?? false,
		);
		if (internal === undefined) {
			return undefined;
		}

		const alternateExchange = await this.promptText(
			"Alternate exchange",
			this.stringArgument(existing?.arguments["alternate-exchange"]),
		);
		if (alternateExchange === undefined) {
			return undefined;
		}

		const argumentsText = await this.promptText(
			"Extra exchange arguments as JSON",
			JSON.stringify(stripExchangeArguments(existing?.arguments ?? {})),
		);
		if (argumentsText === undefined) {
			return undefined;
		}

		return {
			name,
			type,
			durable,
			autoDelete,
			internal,
			alternateExchange: this.normalizeOptional(alternateExchange),
			arguments: parseArgumentsText(argumentsText),
		};
	}

	/**
	 * Collects the source, destination, and routing metadata for a binding.
	 */
	async promptBinding(): Promise<BindingInput | undefined> {
		const source = await this.promptText("Source exchange", "", true);
		if (!source) {
			return undefined;
		}

		const destinationType = await vscode.window.showQuickPick(
			["queue", "exchange"],
			{
				title: "Binding destination type",
				ignoreFocusOut: true,
				placeHolder: "queue",
			},
		);
		if (!destinationType) {
			return undefined;
		}

		const destination = await this.promptText("Destination", "", true);
		if (!destination) {
			return undefined;
		}

		const routingKey = await this.promptText("Routing key", "");
		if (routingKey === undefined) {
			return undefined;
		}

		const argumentsText = await this.promptText(
			"Binding arguments as JSON",
			"{}",
		);
		if (argumentsText === undefined) {
			return undefined;
		}

		return {
			source,
			destinationType: destinationType as BindingDestinationType,
			destination,
			routingKey,
			arguments: parseArgumentsText(argumentsText),
		};
	}

	async promptQueuePublish(
		queue: QueueDetails,
	): Promise<PublishMessageInput | undefined> {
		return this.promptPublishMessage({
			exchange: "",
			propertiesText: "{}",
			routingKey: queue.name,
			routingKeyEditable: false,
			targetLabel: `queue "${queue.name}"`,
		});
	}

	async promptExchangePublish(
		exchange: ExchangeDetails,
	): Promise<PublishMessageInput | undefined> {
		return this.promptPublishMessage({
			exchange: exchange.name,
			propertiesText: "{}",
			routingKey: "",
			routingKeyEditable: true,
			targetLabel: `exchange "${exchange.name || "(default)"}"`,
		});
	}

	private async promptPublishMessage(options: {
		exchange: string;
		propertiesText: string;
		routingKey: string;
		routingKeyEditable: boolean;
		targetLabel: string;
	}): Promise<PublishMessageInput | undefined> {
		const payload = await this.promptText(
			`Message payload for ${options.targetLabel}`,
			"",
			true,
		);
		if (!payload) {
			return undefined;
		}

		const routingKey = options.routingKeyEditable
			? await this.promptText("Routing key", options.routingKey)
			: options.routingKey;
		if (routingKey === undefined) {
			return undefined;
		}

		const propertiesText = await this.promptText(
			"Message properties as JSON",
			options.propertiesText,
		);
		if (propertiesText === undefined) {
			return undefined;
		}

		return {
			exchange: options.exchange,
			routingKey,
			payload,
			properties: parseArgumentsText(propertiesText),
		};
	}

	private async promptText(
		title: string,
		value: string,
		required = false,
	): Promise<string | undefined> {
		return vscode.window.showInputBox({
			title,
			value,
			ignoreFocusOut: true,
			validateInput: (currentValue) =>
				required && !currentValue.trim() ? `${title} is required.` : undefined,
		});
	}

	private async pickBoolean(
		title: string,
		defaultValue: boolean,
	): Promise<boolean | undefined> {
		const options = [
			{ label: "Yes", value: true },
			{ label: "No", value: false },
		];
		const selected = await vscode.window.showQuickPick(options, {
			title,
			ignoreFocusOut: true,
			placeHolder: defaultValue ? "Yes" : "No",
		});
		return selected?.value;
	}

	private stringArgument(value: unknown): string {
		return typeof value === "string" ? value : "";
	}

	private numberArgument(value: unknown): string {
		return typeof value === "number" ? String(value) : "";
	}

	private normalizeOptional(value: string): string | undefined {
		return value.trim() ? value.trim() : undefined;
	}

	private normalizeNumber(value: string): number | undefined {
		if (!value.trim()) {
			return undefined;
		}

		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
}
