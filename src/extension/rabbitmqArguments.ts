import { ValidationError } from "./errors";
import type { ExchangeInput, QueueInput } from "./types/rabbitmq";

export function parseArgumentsText(rawText: string): Record<string, unknown> {
	if (!rawText.trim()) {
		return {};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(rawText);
	} catch {
		throw new ValidationError("Arguments must be valid JSON.");
	}

	if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
		throw new ValidationError("Arguments must be a JSON object.");
	}

	return parsed as Record<string, unknown>;
}

export function buildQueueArguments(
	input: QueueInput,
): Record<string, unknown> {
	const argumentsMap: Record<string, unknown> = { ...input.arguments };

	if (input.deadLetterExchange) {
		argumentsMap["x-dead-letter-exchange"] = input.deadLetterExchange;
	}

	if (input.deadLetterRoutingKey) {
		argumentsMap["x-dead-letter-routing-key"] = input.deadLetterRoutingKey;
	}

	if (typeof input.messageTtl === "number") {
		argumentsMap["x-message-ttl"] = input.messageTtl;
	}

	return argumentsMap;
}

export function buildExchangeArguments(
	input: ExchangeInput,
): Record<string, unknown> {
	const argumentsMap: Record<string, unknown> = { ...input.arguments };

	if (input.alternateExchange) {
		argumentsMap["alternate-exchange"] = input.alternateExchange;
	}

	return argumentsMap;
}

export function stripQueueArguments(
	argumentsMap: Record<string, unknown>,
): Record<string, unknown> {
	const {
		"x-dead-letter-exchange": _deadLetterExchange,
		"x-dead-letter-routing-key": _deadLetterRoutingKey,
		"x-message-ttl": _messageTtl,
		...rest
	} = argumentsMap;
	return rest;
}

export function stripExchangeArguments(
	argumentsMap: Record<string, unknown>,
): Record<string, unknown> {
	const { "alternate-exchange": _alternateExchange, ...rest } = argumentsMap;
	return rest;
}
