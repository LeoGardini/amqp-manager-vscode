import * as vscode from "vscode";

import type { ExtensionSettings } from "./types/connection";

const SECTION = "amqp-manager";
const LEGACY_SECTION = "rabbitmq";

export function getExtensionSettings(): ExtensionSettings {
	const configuration = vscode.workspace.getConfiguration(SECTION);
	const legacyConfiguration = vscode.workspace.getConfiguration(LEGACY_SECTION);
	return {
		defaultConnection: configuration.get<string>(
			"defaultConnection",
			legacyConfiguration.get<string>("defaultConnection", ""),
		),
		autoRefreshSeconds: configuration.get<number>(
			"autoRefreshSeconds",
			legacyConfiguration.get<number>("autoRefreshSeconds", 0),
		),
		requestTimeoutMs: configuration.get<number>(
			"requestTimeoutMs",
			legacyConfiguration.get<number>("requestTimeoutMs", 10000),
		),
		confirmDestructiveActions: configuration.get<boolean>(
			"confirmDestructiveActions",
			legacyConfiguration.get<boolean>("confirmDestructiveActions", true),
		),
	};
}
