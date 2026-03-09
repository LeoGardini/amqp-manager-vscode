import { describe, expect, test } from "bun:test";

import {
	buildExchangeArguments,
	buildQueueArguments,
	parseArgumentsText,
} from "../../src/extension/rabbitmqArguments";

describe("rabbitmq arguments", () => {
	test("parses json objects", () => {
		expect(parseArgumentsText('{"foo":"bar"}')).toEqual({ foo: "bar" });
		expect(parseArgumentsText("   ")).toEqual({});
	});

	test("builds queue arguments with convenience fields", () => {
		expect(
			buildQueueArguments({
				name: "jobs",
				durable: true,
				autoDelete: false,
				exclusive: false,
				arguments: { "x-queue-type": "quorum" },
				deadLetterExchange: "jobs.dlx",
				deadLetterRoutingKey: "jobs.failed",
				messageTtl: 30000,
			}),
		).toEqual({
			"x-queue-type": "quorum",
			"x-dead-letter-exchange": "jobs.dlx",
			"x-dead-letter-routing-key": "jobs.failed",
			"x-message-ttl": 30000,
		});
	});

	test("builds exchange arguments with alternate exchange", () => {
		expect(
			buildExchangeArguments({
				name: "events",
				type: "topic",
				durable: true,
				autoDelete: false,
				internal: false,
				arguments: {},
				alternateExchange: "events.unrouted",
			}),
		).toEqual({
			"alternate-exchange": "events.unrouted",
		});
	});
});
