export interface QueueDetails {
	id: string;
	name: string;
	vhost: string;
	durable: boolean;
	autoDelete: boolean;
	exclusive: boolean;
	arguments: Record<string, unknown>;
	state?: string;
	consumers?: number;
	messages?: number;
	readyMessages?: number;
	unackedMessages?: number;
}

export interface QueueMessageDetails {
	payload: string;
	payloadBytes?: number;
	payloadEncoding?: string;
	redelivered?: boolean;
	exchange?: string;
	routingKey?: string;
	messageCount?: number;
	properties: Record<string, unknown>;
}

export interface ExchangeDetails {
	id: string;
	name: string;
	vhost: string;
	type: string;
	durable: boolean;
	autoDelete: boolean;
	internal: boolean;
	arguments: Record<string, unknown>;
}

export type BindingDestinationType = "queue" | "exchange";

export interface BindingDetails {
	id: string;
	vhost: string;
	source: string;
	destination: string;
	destinationType: BindingDestinationType;
	routingKey: string;
	arguments: Record<string, unknown>;
	propertiesKey: string;
}

export interface QueueInput {
	name: string;
	durable: boolean;
	autoDelete: boolean;
	exclusive: boolean;
	arguments: Record<string, unknown>;
	deadLetterExchange?: string;
	deadLetterRoutingKey?: string;
	messageTtl?: number;
}

export interface ExchangeInput {
	name: string;
	type: string;
	durable: boolean;
	autoDelete: boolean;
	internal: boolean;
	arguments: Record<string, unknown>;
	alternateExchange?: string;
}

export interface BindingInput {
	source: string;
	destination: string;
	destinationType: BindingDestinationType;
	routingKey: string;
	arguments: Record<string, unknown>;
}

export interface PublishMessageInput {
	exchange: string;
	routingKey: string;
	payload: string;
	properties: Record<string, unknown>;
}

export interface ResourceSnapshot {
	queues: QueueDetails[];
	exchanges: ExchangeDetails[];
	bindings: BindingDetails[];
	lastLoadedAt: string;
}
