import { describe, expect, test } from "bun:test";

import {
	createSavedConnectionProfile,
	validateConnectionProfileDraft,
} from "../../src/extension/connectionProfile";

describe("connection profiles", () => {
	test("normalizes urls and required fields", () => {
		const draft = validateConnectionProfileDraft({
			name: " Local Rabbit ",
			managementUrl: "http://localhost:15672/",
			amqpUrl: "amqp://localhost:5672/",
			vhost: "/",
			username: "guest",
			password: "guest",
			tls: false,
			timeoutMs: 1500,
			rejectUnauthorized: true,
		});

		expect(draft.name).toBe("Local Rabbit");
		expect(draft.managementUrl).toBe("http://localhost:15672");
		expect(draft.amqpUrl).toBe("amqp://localhost:5672");
	});

	test("creates a persisted profile", () => {
		const profile = createSavedConnectionProfile({
			name: "Prod",
			managementUrl: "https://rabbit.internal:15671",
			amqpUrl: "amqps://rabbit.internal:5671",
			vhost: "production",
			username: "svc-admin",
			password: "secret",
			tls: true,
			timeoutMs: 5000,
			rejectUnauthorized: true,
		});

		expect(profile.id.length).toBeGreaterThan(0);
		expect(profile.vhost).toBe("production");
	});
});
