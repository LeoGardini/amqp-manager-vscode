import { probeAmqp } from "../../infra/rabbitmq/amqpProbe";
import { ManagementApiClient } from "../../infra/rabbitmq/managementApiClient";
import { MissingConnectionError } from "../errors";
import {
	buildExchangeArguments,
	buildQueueArguments,
} from "../rabbitmqArguments";
import type { ConnectionHealth } from "../types/connection";
import type {
	BindingDetails,
	BindingInput,
	ExchangeDetails,
	ExchangeInput,
	PublishMessageInput,
	QueueDetails,
	QueueInput,
	QueueMessageDetails,
	ResourceSnapshot,
} from "../types/rabbitmq";
import type { ConnectionStore } from "./connectionStore";

export class RabbitMqAdminService {
	/**
	 * Bridges the native VS Code explorer with RabbitMQ management and AMQP operations.
	 */
	constructor(private readonly store: ConnectionStore) {}

	/**
	 * Probes both the Management API and the AMQP endpoint for the selected connection.
	 */
	async testConnection(connectionId?: string): Promise<ConnectionHealth> {
		const { profile, secret } =
			await this.store.resolveConnection(connectionId);
		const managementClient = new ManagementApiClient(profile, secret.password);

		const managementStart = Date.now();
		const managementProbe = await managementClient
			.getOverview()
			.then(() => ({
				ok: true,
				message: "RabbitMQ management API responded successfully.",
				latencyMs: Date.now() - managementStart,
			}))
			.catch((error: unknown) => ({
				ok: false,
				message:
					error instanceof Error
						? error.message
						: "Management API probe failed.",
				latencyMs: Date.now() - managementStart,
			}));
		const amqpProbe = await probeAmqp(profile, secret.password);

		return {
			connectionId: profile.id,
			management: managementProbe,
			amqp: amqpProbe,
			timestamp: new Date().toISOString(),
		};
	}

	/**
	 * Loads the resource snapshot rendered by the native tree views.
	 */
	async listResources(connectionId?: string): Promise<ResourceSnapshot> {
		const client = await this.getManagementClient(connectionId);
		const [queues, exchanges, bindings] = await Promise.all([
			client.listQueues(),
			client.listExchanges(),
			client.listBindings(),
		]);

		return {
			queues,
			exchanges,
			bindings,
			lastLoadedAt: new Date().toISOString(),
		};
	}

	async listQueues(connectionId?: string): Promise<QueueDetails[]> {
		const client = await this.getManagementClient(connectionId);
		return client.listQueues();
	}

	async listExchanges(connectionId?: string): Promise<ExchangeDetails[]> {
		const client = await this.getManagementClient(connectionId);
		return client.listExchanges();
	}

	async getQueue(name: string, connectionId?: string): Promise<QueueDetails> {
		const client = await this.getManagementClient(connectionId);
		return client.getQueue(name);
	}

	async listQueueBindings(
		name: string,
		connectionId?: string,
	): Promise<BindingDetails[]> {
		const client = await this.getManagementClient(connectionId);
		return client.listQueueBindings(name);
	}

	async createQueue(
		input: QueueInput,
		connectionId?: string,
	): Promise<QueueDetails> {
		const client = await this.getManagementClient(connectionId);
		return client.upsertQueue({
			...input,
			arguments: buildQueueArguments(input),
		});
	}

	async updateQueue(
		input: QueueInput,
		connectionId?: string,
	): Promise<QueueDetails> {
		return this.createQueue(input, connectionId);
	}

	async deleteQueue(name: string, connectionId?: string): Promise<void> {
		const client = await this.getManagementClient(connectionId);
		await client.deleteQueue(name);
	}

	async purgeQueue(name: string, connectionId?: string): Promise<void> {
		const client = await this.getManagementClient(connectionId);
		await client.purgeQueue(name);
	}

	async listQueueMessages(
		name: string,
		count: number,
		connectionId?: string,
	): Promise<QueueMessageDetails[]> {
		const client = await this.getManagementClient(connectionId);
		return client.listQueueMessages(name, count);
	}

	async getExchange(
		name: string,
		connectionId?: string,
	): Promise<ExchangeDetails> {
		const client = await this.getManagementClient(connectionId);
		return client.getExchange(name);
	}

	async listExchangeBindings(
		name: string,
		connectionId?: string,
	): Promise<BindingDetails[]> {
		const client = await this.getManagementClient(connectionId);
		return client.listExchangeBindings(name);
	}

	async createExchange(
		input: ExchangeInput,
		connectionId?: string,
	): Promise<ExchangeDetails> {
		const client = await this.getManagementClient(connectionId);
		return client.upsertExchange({
			...input,
			arguments: buildExchangeArguments(input),
		});
	}

	async updateExchange(
		input: ExchangeInput,
		connectionId?: string,
	): Promise<ExchangeDetails> {
		return this.createExchange(input, connectionId);
	}

	async deleteExchange(name: string, connectionId?: string): Promise<void> {
		const client = await this.getManagementClient(connectionId);
		await client.deleteExchange(name);
	}

	async listBindings(connectionId?: string): Promise<BindingDetails[]> {
		const client = await this.getManagementClient(connectionId);
		return client.listBindings();
	}

	async createBinding(
		input: BindingInput,
		connectionId?: string,
	): Promise<void> {
		const client = await this.getManagementClient(connectionId);
		await client.createBinding(input);
	}

	async replaceBinding(
		existing: BindingDetails,
		replacement: BindingInput,
		connectionId?: string,
	): Promise<void> {
		const client = await this.getManagementClient(connectionId);
		await client.deleteBinding(existing);
		await client.createBinding(replacement);
	}

	async deleteBinding(
		binding: BindingDetails,
		connectionId?: string,
	): Promise<void> {
		const client = await this.getManagementClient(connectionId);
		await client.deleteBinding(binding);
	}

	async publishMessage(
		input: PublishMessageInput,
		connectionId?: string,
	): Promise<boolean> {
		const client = await this.getManagementClient(connectionId);
		return client.publishMessage(input);
	}

	/**
	 * Resolves a management client from the active or explicitly selected connection.
	 */
	private async getManagementClient(
		connectionId?: string,
	): Promise<ManagementApiClient> {
		const resolved = await this.store.resolveConnection(connectionId);
		if (!resolved) {
			throw new MissingConnectionError();
		}

		return new ManagementApiClient(resolved.profile, resolved.secret.password);
	}
}
