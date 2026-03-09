import type {
	BindingDetails,
	ExchangeDetails,
	QueueDetails,
	QueueMessageDetails,
} from "../../extension/types/rabbitmq";

interface QueueApiResponse {
	name: string;
	vhost: string;
	durable: boolean;
	auto_delete: boolean;
	exclusive: boolean;
	arguments?: Record<string, unknown>;
	state?: string;
	consumers?: number;
	messages?: number;
	messages_ready?: number;
	messages_unacknowledged?: number;
}

interface QueueMessageApiResponse {
	payload?: string;
	payload_bytes?: number;
	payload_encoding?: string;
	redelivered?: boolean;
	exchange?: string;
	routing_key?: string;
	message_count?: number;
	properties?: Record<string, unknown>;
}

interface ExchangeApiResponse {
	name: string;
	vhost: string;
	type: string;
	durable: boolean;
	auto_delete: boolean;
	internal: boolean;
	arguments?: Record<string, unknown>;
}

interface BindingApiResponse {
	source: string;
	vhost: string;
	destination: string;
	destination_type: "queue" | "exchange";
	routing_key: string;
	arguments?: Record<string, unknown>;
	properties_key: string;
}

function normalizeId(
	connectionId: string,
	vhost: string,
	name: string,
): string {
	return `${connectionId}:${vhost}:${name || "<default>"}`;
}

export function mapQueue(
	connectionId: string,
	queue: QueueApiResponse,
): QueueDetails {
	return {
		id: normalizeId(connectionId, queue.vhost, queue.name),
		name: queue.name,
		vhost: queue.vhost,
		durable: queue.durable,
		autoDelete: queue.auto_delete,
		exclusive: queue.exclusive,
		arguments: queue.arguments ?? {},
		state: queue.state,
		consumers: queue.consumers,
		messages: queue.messages,
		readyMessages: queue.messages_ready,
		unackedMessages: queue.messages_unacknowledged,
	};
}

export function mapQueueMessage(
	message: QueueMessageApiResponse,
): QueueMessageDetails {
	return {
		payload: message.payload ?? "",
		payloadBytes: message.payload_bytes,
		payloadEncoding: message.payload_encoding,
		redelivered: message.redelivered,
		exchange: message.exchange,
		routingKey: message.routing_key,
		messageCount: message.message_count,
		properties: message.properties ?? {},
	};
}

export function mapExchange(
	connectionId: string,
	exchange: ExchangeApiResponse,
): ExchangeDetails {
	return {
		id: normalizeId(connectionId, exchange.vhost, exchange.name),
		name: exchange.name,
		vhost: exchange.vhost,
		type: exchange.type,
		durable: exchange.durable,
		autoDelete: exchange.auto_delete,
		internal: exchange.internal,
		arguments: exchange.arguments ?? {},
	};
}

export function mapBinding(
	connectionId: string,
	binding: BindingApiResponse,
): BindingDetails {
	return {
		id: `${normalizeId(connectionId, binding.vhost, binding.source)}:${binding.destination_type}:${binding.destination}:${binding.properties_key}`,
		vhost: binding.vhost,
		source: binding.source,
		destination: binding.destination,
		destinationType: binding.destination_type,
		routingKey: binding.routing_key,
		arguments: binding.arguments ?? {},
		propertiesKey: binding.properties_key,
	};
}
