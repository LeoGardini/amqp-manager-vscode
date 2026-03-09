export interface SavedConnectionProfile {
	id: string;
	name: string;
	managementUrl: string;
	amqpUrl: string;
	vhost: string;
	username: string;
	tls: boolean;
	timeoutMs: number;
	rejectUnauthorized: boolean;
}

export interface StoredConnectionProfile extends SavedConnectionProfile {
	password: string;
}

export interface ConnectionProfileDraft {
	name: string;
	managementUrl: string;
	amqpUrl: string;
	vhost: string;
	username: string;
	password: string;
	tls: boolean;
	timeoutMs: number;
	rejectUnauthorized: boolean;
}

export interface ConnectionSummary extends SavedConnectionProfile {
	hasSecret: boolean;
}

export interface ResolvedConnectionProfile {
	profile: SavedConnectionProfile;
	secret: {
		password: string;
	};
}

export interface ExtensionSettings {
	defaultConnection: string;
	autoRefreshSeconds: number;
	requestTimeoutMs: number;
	confirmDestructiveActions: boolean;
}

export interface ConnectionHealth {
	connectionId: string;
	management: HealthProbe;
	amqp: HealthProbe;
	timestamp: string;
}

export interface HealthProbe {
	ok: boolean;
	message: string;
	latencyMs?: number;
}
