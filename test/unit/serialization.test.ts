import { describe, expect, test } from "bun:test";

import { AppError } from "../../src/extension/errors";
import { serializeError } from "../../src/extension/serialization";

describe("error serialization", () => {
	test("preserves app error metadata", () => {
		const serialized = serializeError(new AppError("Boom", "boom"));
		expect(serialized).toEqual({
			code: "boom",
			message: "Boom",
		});
	});

	test("handles unknown errors", () => {
		expect(serializeError("wat")).toEqual({
			code: "unknown_error",
			message: "Unexpected error.",
		});
	});
});
