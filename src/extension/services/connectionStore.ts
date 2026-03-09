import * as vscode from "vscode";

import {
	createSavedConnectionProfile,
	toConnectionSummary,
} from "../connectionProfile";
import { MissingConnectionError } from "../errors";
import { getExtensionSettings } from "../settings";
import type {
	ConnectionProfileDraft,
	ConnectionSummary,
	ResolvedConnectionProfile,
	SavedConnectionProfile,
	StoredConnectionProfile,
} from "../types/connection";

const CONNECTIONS_KEY = "connections";
const ACTIVE_CONNECTION_KEY = "amqp-manager.activeConnectionId";
const SECTION = "amqp-manager";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getOptionalString(
	value: Record<string, unknown>,
	key: string,
): string | undefined {
	const candidate = value[key];
	return typeof candidate === "string" && candidate.trim().length > 0
		? candidate.trim()
		: undefined;
}

function getOptionalBoolean(
	value: Record<string, unknown>,
	key: string,
): boolean | undefined {
	return typeof value[key] === "boolean" ? value[key] : undefined;
}

function getOptionalNumber(
	value: Record<string, unknown>,
	key: string,
): number | undefined {
	const candidate = value[key];
	return typeof candidate === "number" && Number.isFinite(candidate)
		? candidate
		: undefined;
}

function createLegacyConnectionId(profile: {
	name: string;
	managementUrl: string;
	amqpUrl: string;
	username: string;
	vhost: string;
}): string {
	return [
		"legacy",
		profile.name,
		profile.managementUrl,
		profile.amqpUrl,
		profile.username,
		profile.vhost,
	].join(":");
}

export class ConnectionStore {
	/**
	 * Persists RabbitMQ profiles in workspace settings so the project owns the connection list.
	 */
	constructor(private readonly context: vscode.ExtensionContext) {}

	/**
	 * Returns every saved RabbitMQ connection profile from `settings.json`.
	 */
	async listProfiles(): Promise<SavedConnectionProfile[]> {
		const profiles = await this.listStoredProfiles();
		return profiles.map(({ password: _password, ...profile }) => profile);
	}

	/**
	 * Returns profiles enriched with password availability for native explorer rendering.
	 */
	async listSummaries(): Promise<ConnectionSummary[]> {
		const profiles = await this.listStoredProfiles();
		return profiles.map(({ password, ...profile }) =>
			toConnectionSummary(profile, Boolean(password)),
		);
	}

	/**
	 * Stores connection metadata and password in workspace settings.
	 */
	async saveConnection(
		draft: ConnectionProfileDraft,
		existingId?: string,
	): Promise<SavedConnectionProfile> {
		await this.ensureWorkspaceConfiguration();

		const profiles = await this.listStoredProfiles();
		const profile = createSavedConnectionProfile(draft, existingId);
		const storedProfile: StoredConnectionProfile = {
			...profile,
			password: draft.password,
		};
		const nextProfiles = profiles.filter((item) => item.id !== profile.id);
		nextProfiles.push(storedProfile);
		nextProfiles.sort((left, right) => left.name.localeCompare(right.name));

		await this.writeStoredProfiles(nextProfiles);

		const activeConnectionId = await this.getActiveConnectionId();
		if (!activeConnectionId) {
			await this.setActiveConnection(profile.id);
		}

		return profile;
	}

	/**
	 * Removes a saved profile and clears the active connection when necessary.
	 */
	async deleteConnection(connectionId: string): Promise<void> {
		const profiles = await this.listStoredProfiles();
		const nextProfiles = profiles.filter((item) => item.id !== connectionId);

		await this.writeStoredProfiles(nextProfiles);

		if ((await this.getActiveConnectionId()) === connectionId) {
			await this.context.workspaceState.update(
				ACTIVE_CONNECTION_KEY,
				nextProfiles[0]?.id,
			);
		}
	}

	async getById(
		connectionId: string,
	): Promise<SavedConnectionProfile | undefined> {
		const profiles = await this.listProfiles();
		return profiles.find((profile) => profile.id === connectionId);
	}

	async setActiveConnection(connectionId: string): Promise<void> {
		await this.context.workspaceState.update(
			ACTIVE_CONNECTION_KEY,
			connectionId,
		);
	}

	/**
	 * Clears the active connection selection without touching the saved profiles.
	 */
	async clearActiveConnection(): Promise<void> {
		await this.context.workspaceState.update(ACTIVE_CONNECTION_KEY, undefined);
	}

	/**
	 * Returns a valid active connection id, falling back to the configured default
	 * and automatically dropping stale selections.
	 */
	async getActiveConnectionId(): Promise<string | undefined> {
		const profiles = await this.listProfiles();
		const storedActive = this.context.workspaceState.get<string | undefined>(
			ACTIVE_CONNECTION_KEY,
		);
		if (
			storedActive &&
			profiles.some((profile) => profile.id === storedActive)
		) {
			return storedActive;
		}
		if (storedActive) {
			await this.clearActiveConnection();
		}

		const settings = getExtensionSettings();
		if (!settings.defaultConnection) {
			return profiles[0]?.id;
		}

		return (
			profiles.find(
				(profile) =>
					profile.id === settings.defaultConnection ||
					profile.name === settings.defaultConnection,
			)?.id ?? profiles[0]?.id
		);
	}

	/**
	 * Resolves the complete active connection state, including the password persisted in settings.
	 */
	async resolveConnection(
		connectionId?: string,
	): Promise<ResolvedConnectionProfile> {
		const targetId = connectionId ?? (await this.getActiveConnectionId());
		if (!targetId) {
			throw new MissingConnectionError();
		}

		const profile = (await this.listStoredProfiles()).find(
			(item) => item.id === targetId,
		);
		if (!profile) {
			throw new MissingConnectionError(
				"The selected RabbitMQ connection no longer exists.",
			);
		}
		if (!profile.password) {
			throw new MissingConnectionError(
				"No credentials were found for the selected RabbitMQ connection.",
			);
		}

		const { password, ...savedProfile } = profile;
		return {
			profile: savedProfile,
			secret: { password },
		};
	}

	private async listStoredProfiles(): Promise<StoredConnectionProfile[]> {
		const configuration = vscode.workspace.getConfiguration(SECTION);
		const rawProfiles = configuration.get<unknown[]>(CONNECTIONS_KEY, []);
		const profiles = rawProfiles
			.map((profile) => this.normalizeProfile(profile))
			.filter(
				(profile): profile is StoredConnectionProfile => profile !== undefined,
			);

		if (profiles.length !== rawProfiles.length) {
			await this.writeStoredProfiles(profiles);
		}

		return profiles;
	}

	private async writeStoredProfiles(
		profiles: StoredConnectionProfile[],
	): Promise<void> {
		await this.ensureWorkspaceConfiguration();
		await vscode.workspace
			.getConfiguration(SECTION)
			.update(CONNECTIONS_KEY, profiles, vscode.ConfigurationTarget.Workspace);
	}

	private async ensureWorkspaceConfiguration(): Promise<void> {
		if (
			vscode.workspace.workspaceFile ||
			vscode.workspace.workspaceFolders?.length
		) {
			return;
		}

		throw new MissingConnectionError(
			"Open a workspace folder to save RabbitMQ connections in .vscode/settings.json.",
		);
	}

	private normalizeProfile(
		value: unknown,
	): StoredConnectionProfile | undefined {
		if (!isRecord(value)) {
			return undefined;
		}

		const name = getOptionalString(value, "name");
		const managementUrl =
			getOptionalString(value, "managementUrl") ??
			getOptionalString(value, "managementApiUrl") ??
			getOptionalString(value, "url");
		const amqpUrl =
			getOptionalString(value, "amqpUrl") ??
			getOptionalString(value, "amqpUri");
		const username = getOptionalString(value, "username");
		const vhost = getOptionalString(value, "vhost");
		const password = getOptionalString(value, "password");
		if (!(name && managementUrl && amqpUrl && username && vhost && password)) {
			return undefined;
		}

		return {
			id:
				getOptionalString(value, "id") ??
				createLegacyConnectionId({
					name,
					managementUrl,
					amqpUrl,
					username,
					vhost,
				}),
			name,
			managementUrl,
			amqpUrl,
			vhost,
			username,
			password,
			tls:
				getOptionalBoolean(value, "tls") ?? managementUrl.startsWith("https"),
			timeoutMs:
				getOptionalNumber(value, "timeoutMs") ??
				getExtensionSettings().requestTimeoutMs,
			rejectUnauthorized:
				getOptionalBoolean(value, "rejectUnauthorized") ?? true,
		};
	}
}
