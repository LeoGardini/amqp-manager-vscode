export interface SerializedError {
	code: string;
	message: string;
}

export function serializeError(error: unknown): SerializedError {
	if (error instanceof Error) {
		const maybeCode =
			"code" in error && typeof error.code === "string"
				? error.code
				: "unknown_error";
		return {
			code: maybeCode,
			message: error.message,
		};
	}

	return {
		code: "unknown_error",
		message: "Unexpected error.",
	};
}
