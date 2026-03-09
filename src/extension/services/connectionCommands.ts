import * as vscode from "vscode";

import { getExtensionSettings } from "../settings";
import type {
	ConnectionProfileDraft,
	SavedConnectionProfile,
} from "../types/connection";
import { ConnectionInputService } from "./connectionInputService";
import type { ConnectionStore } from "./connectionStore";

export class ConnectionCommands {
	constructor(private readonly store: ConnectionStore) {}

	/**
	 * Collects user input and saves a new RabbitMQ connection profile.
	 */
	async addConnection(): Promise<SavedConnectionProfile | undefined> {
		const draft = await this.createInputService().prompt();
		if (!draft) {
			return undefined;
		}

		const savedProfile = await this.store.saveConnection(draft);
		await this.store.setActiveConnection(savedProfile.id);
		return savedProfile;
	}

	/**
	 * Updates an existing saved connection while preserving the current password when requested.
	 */
	async editConnection(
		connectionId?: string,
	): Promise<SavedConnectionProfile | undefined> {
		const target = await this.pickConnection(
			connectionId,
			"Select a RabbitMQ connection to edit",
		);
		if (!target) {
			return undefined;
		}

		const resolved = await this.store.resolveConnection(target.id);
		const draft = await this.createInputService().prompt(target);
		if (!draft) {
			return undefined;
		}

		const nextDraft: ConnectionProfileDraft = {
			...draft,
			password:
				draft.password === "__KEEP_EXISTING_PASSWORD__"
					? resolved.secret.password
					: draft.password,
		};

		const savedProfile = await this.store.saveConnection(nextDraft, target.id);
		await this.store.setActiveConnection(savedProfile.id);
		return savedProfile;
	}

	/**
	 * Removes a saved connection after an explicit user confirmation.
	 */
	async removeConnection(connectionId?: string): Promise<boolean> {
		const target = await this.pickConnection(
			connectionId,
			"Select a RabbitMQ connection to remove",
		);
		if (!target) {
			return false;
		}

		const answer = await vscode.window.showWarningMessage(
			`Remove the connection "${target.name}"?`,
			{ modal: true },
			"Remove",
		);
		if (answer !== "Remove") {
			return false;
		}

		await this.store.deleteConnection(target.id);
		return true;
	}

	private async pickConnection(
		connectionId: string | undefined,
		title: string,
	): Promise<SavedConnectionProfile | undefined> {
		if (connectionId) {
			return this.store.getById(connectionId);
		}

		const profiles = await this.store.listProfiles();
		if (profiles.length === 0) {
			vscode.window.showWarningMessage(
				"No RabbitMQ connections are configured yet.",
			);
			return undefined;
		}

		if (profiles.length === 1) {
			return profiles[0];
		}

		const selected = await vscode.window.showQuickPick(
			profiles.map((profile) => ({
				label: profile.name,
				description: profile.managementUrl,
				detail: `${profile.username} @ ${profile.vhost}`,
				profile,
			})),
			{ title, ignoreFocusOut: true },
		);

		return selected?.profile;
	}

	private createInputService(): ConnectionInputService {
		return new ConnectionInputService({
			defaultTimeoutMs: getExtensionSettings().requestTimeoutMs,
		});
	}
}
