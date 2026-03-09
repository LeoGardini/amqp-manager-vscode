import { Agent, type Dispatcher } from "undici";

import { AppError } from "../../extension/errors";
import type { SavedConnectionProfile } from "../../extension/types/connection";
import type {
	BindingDetails,
	BindingInput,
	ExchangeDetails,
	ExchangeInput,
	PublishMessageInput,
	QueueDetails,
	QueueInput,
	QueueMessageDetails,
} from "../../extension/types/rabbitmq";
import { mapBinding, mapExchange, mapQueue, mapQueueMessage } from "./mappers";

interface RequestOptions {
	method: "GET" | "POST" | "PUT" | "DELETE";
	path: string;
	body?: Record<string, unknown>;
}

interface FetchRequestInit extends RequestInit {
	dispatcher?: Dispatcher;
}

const INSECURE_HTTPS_DISPATCHER = new Agent({
	connect: {
		rejectUnauthorized: false,
	},
});

export class ManagementApiError extends AppError {
	constructor(
		message: string,
		readonly statusCode?: number,
	) {
		super(message, "management_api_error");
		this.name = "ManagementApiError";
	}
}

export class ManagementApiClient {
	constructor(
		private readonly profile: SavedConnectionProfile,
		private readonly password: string,
	) {}

	async getOverview(): Promise<Record<string, unknown>> {
		return this.requestJson({ method: "GET", path: "/api/overview" });
	}

	async listQueues(): Promise<QueueDetails[]> {
		const response = await this.requestJson<unknown[]>({
			method: "GET",
			path: `/api/queues/${encodeURIComponent(this.profile.vhost)}`,
		});
		return response.map((item) => mapQueue(this.profile.id, item as never));
	}

	async getQueue(name: string): Promise<QueueDetails> {
		const response = await this.requestJson({
			method: "GET",
			path: `/api/queues/${encodeURIComponent(this.profile.vhost)}/${encodeURIComponent(name)}`,
		});
		return mapQueue(this.profile.id, response as never);
	}

	async listQueueBindings(name: string): Promise<BindingDetails[]> {
		const response = await this.requestJson<unknown[]>({
			method: "GET",
			path: `/api/queues/${encodeURIComponent(this.profile.vhost)}/${encodeURIComponent(name)}/bindings`,
		});
		return response
			.filter((binding) => typeof binding === "object" && binding !== null)
			.map((binding) => mapBinding(this.profile.id, binding as never));
	}

	async upsertQueue(input: QueueInput): Promise<QueueDetails> {
		await this.requestJson({
			method: "PUT",
			path: `/api/queues/${encodeURIComponent(this.profile.vhost)}/${encodeURIComponent(input.name)}`,
			body: {
				auto_delete: input.autoDelete,
				durable: input.durable,
				exclusive: input.exclusive,
				arguments: input.arguments,
			},
		});
		return this.getQueue(input.name);
	}

	async deleteQueue(name: string): Promise<void> {
		await this.requestJson({
			method: "DELETE",
			path: `/api/queues/${encodeURIComponent(this.profile.vhost)}/${encodeURIComponent(name)}`,
		});
	}

	async purgeQueue(name: string): Promise<void> {
		await this.requestJson({
			method: "DELETE",
			path: `/api/queues/${encodeURIComponent(this.profile.vhost)}/${encodeURIComponent(name)}/contents`,
		});
	}

	async listQueueMessages(
		name: string,
		count: number,
	): Promise<QueueMessageDetails[]> {
		if (count <= 0) {
			return [];
		}

		const response = await this.requestJson<unknown[]>({
			method: "POST",
			path: `/api/queues/${encodeURIComponent(this.profile.vhost)}/${encodeURIComponent(name)}/get`,
			body: {
				ackmode: "ack_requeue_true",
				count,
				encoding: "auto",
				truncate: 50000,
			},
		});

		return response.map((message) => mapQueueMessage(message as never));
	}

	async listExchanges(): Promise<ExchangeDetails[]> {
		const response = await this.requestJson<unknown[]>({
			method: "GET",
			path: `/api/exchanges/${encodeURIComponent(this.profile.vhost)}`,
		});
		return response.map((item) => mapExchange(this.profile.id, item as never));
	}

	async getExchange(name: string): Promise<ExchangeDetails> {
		const response = await this.requestJson({
			method: "GET",
			path: `/api/exchanges/${encodeURIComponent(this.profile.vhost)}/${encodeURIComponent(name)}`,
		});
		return mapExchange(this.profile.id, response as never);
	}

	async listExchangeBindings(name: string): Promise<BindingDetails[]> {
		const response = await this.requestJson<unknown[]>({
			method: "GET",
			path: `/api/exchanges/${encodeURIComponent(this.profile.vhost)}/${encodeURIComponent(name)}/bindings/source`,
		});
		return response
			.filter((binding) => typeof binding === "object" && binding !== null)
			.map((binding) => mapBinding(this.profile.id, binding as never));
	}

	async upsertExchange(input: ExchangeInput): Promise<ExchangeDetails> {
		await this.requestJson({
			method: "PUT",
			path: `/api/exchanges/${encodeURIComponent(this.profile.vhost)}/${encodeURIComponent(input.name)}`,
			body: {
				type: input.type,
				auto_delete: input.autoDelete,
				durable: input.durable,
				internal: input.internal,
				arguments: input.arguments,
			},
		});
		return this.getExchange(input.name);
	}

	async deleteExchange(name: string): Promise<void> {
		await this.requestJson({
			method: "DELETE",
			path: `/api/exchanges/${encodeURIComponent(this.profile.vhost)}/${encodeURIComponent(name)}`,
		});
	}

	async listBindings(): Promise<BindingDetails[]> {
		const response = await this.requestJson<unknown[]>({
			method: "GET",
			path: `/api/bindings/${encodeURIComponent(this.profile.vhost)}`,
		});
		return response
			.filter((binding) => typeof binding === "object" && binding !== null)
			.map((binding) => mapBinding(this.profile.id, binding as never));
	}

	async createBinding(input: BindingInput): Promise<void> {
		const destinationType = input.destinationType === "queue" ? "q" : "e";
		await this.requestJson({
			method: "POST",
			path: `/api/bindings/${encodeURIComponent(this.profile.vhost)}/e/${encodeURIComponent(input.source)}/${destinationType}/${encodeURIComponent(input.destination)}`,
			body: {
				routing_key: input.routingKey,
				arguments: input.arguments,
			},
		});
	}

	async deleteBinding(binding: BindingDetails): Promise<void> {
		const destinationType = binding.destinationType === "queue" ? "q" : "e";
		await this.requestJson({
			method: "DELETE",
			path: `/api/bindings/${encodeURIComponent(this.profile.vhost)}/e/${encodeURIComponent(binding.source)}/${destinationType}/${encodeURIComponent(binding.destination)}/${encodeURIComponent(binding.propertiesKey)}`,
		});
	}

	async publishMessage(input: PublishMessageInput): Promise<boolean> {
		const response = await this.requestJson<{ routed?: boolean }>({
			method: "POST",
			path: `/api/exchanges/${encodeURIComponent(this.profile.vhost)}/${encodeExchangeName(input.exchange)}/publish`,
			body: {
				properties: input.properties,
				routing_key: input.routingKey,
				payload: input.payload,
				payload_encoding: "string",
			},
		});

		return response.routed ?? false;
	}

	private async requestJson<T = Record<string, unknown>>(
		options: RequestOptions,
	): Promise<T> {
		const baseUrl = new URL(this.profile.managementUrl);
		const target = new URL(options.path, `${baseUrl.toString()}/`);
		const body = options.body ? JSON.stringify(options.body) : undefined;

		try {
			const response = await fetch(
				target,
				this.createRequestInit(options, body),
			);
			const payload = await response.text();
			const parsed = payload ? tryParseJson(payload) : undefined;

			if (response.ok) {
				return (parsed ?? {}) as T;
			}

			throw this.toError(response.status, parsed, payload);
		} catch (error) {
			if (error instanceof ManagementApiError) {
				throw error;
			}

			throw this.toRequestError(error);
		}
	}

	private createRequestInit(
		options: RequestOptions,
		body: string | undefined,
	): FetchRequestInit {
		const basicAuth = Buffer.from(
			`${this.profile.username}:${this.password}`,
		).toString("base64");

		return {
			method: options.method,
			headers: {
				Accept: "application/json",
				Authorization: `Basic ${basicAuth}`,
				...(body ? { "Content-Type": "application/json" } : {}),
			},
			body,
			signal: AbortSignal.timeout(this.profile.timeoutMs),
			dispatcher: this.getDispatcher(),
		};
	}

	private getDispatcher(): Dispatcher | undefined {
		return this.profile.managementUrl.startsWith("https:") &&
			!this.profile.rejectUnauthorized
			? INSECURE_HTTPS_DISPATCHER
			: undefined;
	}

	private toRequestError(error: unknown): ManagementApiError {
		if (error instanceof Error && error.name === "TimeoutError") {
			return new ManagementApiError("Management API request timed out.");
		}

		const code =
			extractErrorCode(error) ?? extractErrorCode(getErrorCause(error));
		if (
			code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
			code === "SELF_SIGNED_CERT_IN_CHAIN"
		) {
			return new ManagementApiError(
				"TLS validation failed for the management endpoint.",
			);
		}

		return new ManagementApiError(
			error instanceof Error ? error.message : "Management API request failed.",
		);
	}

	private toError(
		statusCode: number,
		parsedPayload: unknown,
		rawPayload: string,
	): ManagementApiError {
		if (statusCode === 401 || statusCode === 403) {
			return new ManagementApiError(
				"Management API credentials were rejected.",
				statusCode,
			);
		}

		if (statusCode === 404) {
			return new ManagementApiError(
				"Management API resource was not found. Confirm the management plugin and vhost are available.",
				statusCode,
			);
		}

		const message =
			extractApiErrorMessage(parsedPayload) ??
			(rawPayload ||
				`Management API request failed with status ${statusCode}.`);

		return new ManagementApiError(message, statusCode);
	}
}

function extractApiErrorMessage(payload: unknown): string | undefined {
	if (typeof payload !== "object" || payload === null) {
		return undefined;
	}

	const error =
		"error" in payload && typeof payload.error === "string"
			? payload.error
			: undefined;
	if (!error) {
		return undefined;
	}

	const reason =
		"reason" in payload && typeof payload.reason === "string"
			? payload.reason
			: undefined;

	return reason ? `${error}: ${reason}` : error;
}

function getErrorCause(error: unknown): unknown {
	return error instanceof Error ? error.cause : undefined;
}

function extractErrorCode(error: unknown): string | undefined {
	return typeof error === "object" &&
		error !== null &&
		"code" in error &&
		typeof error.code === "string"
		? error.code
		: undefined;
}

function tryParseJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

function encodeExchangeName(name: string): string {
	return encodeURIComponent(name || "amq.default");
}
