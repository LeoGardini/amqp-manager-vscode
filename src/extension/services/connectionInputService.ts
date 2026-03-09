import * as vscode from "vscode";

import type {
	ConnectionProfileDraft,
	SavedConnectionProfile,
} from "../types/connection";

interface ConnectionPromptOptions {
	defaultTimeoutMs: number;
}

export class ConnectionInputService {
	constructor(private readonly options: ConnectionPromptOptions) {}

	async prompt(
		existing?: SavedConnectionProfile,
	): Promise<ConnectionProfileDraft | undefined> {
		const name = await vscode.window.showInputBox({
			title: existing ? "Edit Connection" : "Add Connection",
			prompt: "Connection name",
			value: existing?.name ?? "",
			ignoreFocusOut: true,
			validateInput: (value) =>
				value.trim() ? undefined : "Connection name is required.",
		});
		if (name === undefined) {
			return undefined;
		}

		const managementUrl = await vscode.window.showInputBox({
			title: "RabbitMQ Management API URL",
			prompt: "Example: http://localhost:15672",
			value: existing?.managementUrl ?? "http://localhost:15672",
			ignoreFocusOut: true,
		});
		if (managementUrl === undefined) {
			return undefined;
		}

		const amqpUrl = await vscode.window.showInputBox({
			title: "AMQP URL",
			prompt: "Example: amqp://localhost:5672",
			value: existing?.amqpUrl ?? "amqp://localhost:5672",
			ignoreFocusOut: true,
		});
		if (amqpUrl === undefined) {
			return undefined;
		}

		const vhost = await vscode.window.showInputBox({
			title: "Virtual Host",
			prompt: "Use / for the default vhost.",
			value: existing?.vhost ?? "/",
			ignoreFocusOut: true,
			validateInput: (value) =>
				value.trim() ? undefined : "Virtual host is required.",
		});
		if (vhost === undefined) {
			return undefined;
		}

		const username = await vscode.window.showInputBox({
			title: "Username",
			value: existing?.username ?? "guest",
			ignoreFocusOut: true,
			validateInput: (value) =>
				value.trim() ? undefined : "Username is required.",
		});
		if (username === undefined) {
			return undefined;
		}

		const password = await vscode.window.showInputBox({
			title: "Password",
			password: true,
			ignoreFocusOut: true,
			prompt: existing
				? "Leave blank to keep the current password."
				: "Password",
			validateInput: (value) =>
				existing || value.length > 0
					? undefined
					: "Password is required for new connections.",
		});
		if (password === undefined) {
			return undefined;
		}

		const tls = await this.pickBoolean(
			"Use TLS?",
			existing?.tls ?? managementUrl.startsWith("https"),
		);
		if (tls === undefined) {
			return undefined;
		}

		const rejectUnauthorized = await this.pickBoolean(
			"Reject invalid TLS certificates?",
			existing?.rejectUnauthorized ?? true,
		);
		if (rejectUnauthorized === undefined) {
			return undefined;
		}

		const timeoutValue = await vscode.window.showInputBox({
			title: "Request timeout in milliseconds",
			value: String(existing?.timeoutMs ?? this.options.defaultTimeoutMs),
			ignoreFocusOut: true,
			validateInput: (value) => {
				const timeoutMs = Number(value);
				return Number.isFinite(timeoutMs) && timeoutMs >= 1000
					? undefined
					: "Timeout must be a number greater than or equal to 1000.";
			},
		});
		if (timeoutValue === undefined) {
			return undefined;
		}

		return {
			name,
			managementUrl,
			amqpUrl,
			vhost,
			username,
			password: password || (existing ? "__KEEP_EXISTING_PASSWORD__" : ""),
			tls,
			timeoutMs: Number(timeoutValue),
			rejectUnauthorized,
		};
	}

	private async pickBoolean(
		title: string,
		defaultValue: boolean,
	): Promise<boolean | undefined> {
		const selected = await vscode.window.showQuickPick(
			[
				{ label: "Yes", value: true },
				{ label: "No", value: false },
			],
			{
				title,
				ignoreFocusOut: true,
				placeHolder: defaultValue ? "Yes" : "No",
			},
		);
		return selected?.value;
	}
}
