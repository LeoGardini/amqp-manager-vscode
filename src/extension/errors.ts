export class AppError extends Error {
	constructor(
		message: string,
		readonly code: string,
	) {
		super(message);
		this.name = "AppError";
	}
}

export class MissingConnectionError extends AppError {
	constructor(message = "No active RabbitMQ connection is configured.") {
		super(message, "missing_connection");
		this.name = "MissingConnectionError";
	}
}

export class ValidationError extends AppError {
	constructor(message: string) {
		super(message, "validation_error");
		this.name = "ValidationError";
	}
}
