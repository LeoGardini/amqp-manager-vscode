import { randomUUID } from "node:crypto";

import { ValidationError } from "./errors";
import type {
	ConnectionProfileDraft,
	ConnectionSummary,
	SavedConnectionProfile,
} from "./types/connection";

function normalizeUrl(rawUrl: string, label: string): string {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl.trim());
	} catch {
		throw new ValidationError(`${label} must be a valid URL.`);
	}

	if (!parsed.protocol || !parsed.host) {
		throw new ValidationError(`${label} must include protocol and host.`);
	}

	parsed.pathname = parsed.pathname.replace(/\/$/, "");
	return parsed.toString().replace(/\/$/, "");
}

export function validateConnectionProfileDraft(
	draft: ConnectionProfileDraft,
): ConnectionProfileDraft {
	if (!draft.name.trim()) {
		throw new ValidationError("Connection name is required.");
	}

	if (!draft.username.trim()) {
		throw new ValidationError("Username is required.");
	}

	if (!draft.password) {
		throw new ValidationError("Password is required.");
	}

	if (!draft.vhost.trim()) {
		throw new ValidationError("Virtual host is required.");
	}

	const timeoutMs = Number(draft.timeoutMs);
	if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
		throw new ValidationError("Timeout must be at least 1000ms.");
	}

	return {
		...draft,
		name: draft.name.trim(),
		username: draft.username.trim(),
		vhost: draft.vhost.trim(),
		managementUrl: normalizeUrl(draft.managementUrl, "Management URL"),
		amqpUrl: normalizeUrl(draft.amqpUrl, "AMQP URL"),
		timeoutMs,
	};
}

export function createSavedConnectionProfile(
	draft: ConnectionProfileDraft,
	existingId?: string,
): SavedConnectionProfile {
	const validated = validateConnectionProfileDraft(draft);
	return {
		id: existingId ?? randomUUID(),
		name: validated.name,
		managementUrl: validated.managementUrl,
		amqpUrl: validated.amqpUrl,
		vhost: validated.vhost,
		username: validated.username,
		tls: validated.tls,
		timeoutMs: validated.timeoutMs,
		rejectUnauthorized: validated.rejectUnauthorized,
	};
}

export function toConnectionSummary(
	profile: SavedConnectionProfile,
	hasSecret: boolean,
): ConnectionSummary {
	return {
		...profile,
		hasSecret,
	};
}
