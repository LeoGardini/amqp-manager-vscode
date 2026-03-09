import { describe, expect, test } from "bun:test";

import {
	mapBinding,
	mapExchange,
	mapQueue,
} from "../../src/infra/rabbitmq/mappers";

describe("management api mappers", () => {
	test("maps queues to normalized ids", () => {
		const queue = mapQueue("conn-1", {
			name: "jobs",
			vhost: "/",
			durable: true,
			auto_delete: false,
			exclusive: false,
			arguments: { "x-queue-type": "classic" },
			state: "running",
			consumers: 2,
			messages: 10,
			messages_ready: 7,
			messages_unacknowledged: 3,
		});

		expect(queue.id).toBe("conn-1:/:jobs");
		expect(queue.messages).toBe(10);
	});

	test("maps exchanges and bindings", () => {
		const exchange = mapExchange("conn-1", {
			name: "events",
			vhost: "/",
			type: "topic",
			durable: true,
			auto_delete: false,
			internal: false,
			arguments: {},
		});
		const binding = mapBinding("conn-1", {
			source: "events",
			vhost: "/",
			destination: "jobs",
			destination_type: "queue",
			routing_key: "jobs.created",
			arguments: {},
			properties_key: "jobs.created",
		});

		expect(exchange.type).toBe("topic");
		expect(binding.destinationType).toBe("queue");
		expect(binding.id).toContain("jobs.created");
	});
});
