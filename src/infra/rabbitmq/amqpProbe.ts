import { connect } from "amqplib";

import { AppError } from "../../extension/errors";
import type {
	HealthProbe,
	SavedConnectionProfile,
} from "../../extension/types/connection";

export class AmqpProbeError extends AppError {
	constructor(message: string) {
		super(message, "amqp_probe_error");
		this.name = "AmqpProbeError";
	}
}

export async function probeAmqp(
	profile: SavedConnectionProfile,
	password: string,
): Promise<HealthProbe> {
	const startedAt = Date.now();

	try {
		const connection = await connect(profile.amqpUrl, {
			username: profile.username,
			password,
			timeout: profile.timeoutMs,
			servername: new URL(profile.amqpUrl).hostname,
			rejectUnauthorized: profile.rejectUnauthorized,
			vhost: profile.vhost,
		});
		await connection.close();
		return {
			ok: true,
			message: "AMQP connection succeeded.",
			latencyMs: Date.now() - startedAt,
		};
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unable to establish an AMQP connection to the broker.";
		return {
			ok: false,
			message:
				message.includes("CERT") || message.includes("certificate")
					? "TLS validation failed for the AMQP endpoint."
					: message,
			latencyMs: Date.now() - startedAt,
		};
	}
}
