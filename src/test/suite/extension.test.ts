import * as assert from "node:assert/strict";

import * as vscode from "vscode";

suite("AMQP Manager Extension", () => {
	test("registers the AMQP Manager commands", async () => {
		const extension = vscode.extensions.getExtension(
			"LeoGardini.amqp-manager-vscode",
		);

		assert.ok(
			extension,
			"Expected the AMQP Manager extension to be available.",
		);
		await extension.activate();

		const commands = await vscode.commands.getCommands(true);

		assert.ok(commands.includes("amqp-manager.openPanel"));
		assert.ok(commands.includes("amqp-manager.addConnection"));
		assert.ok(commands.includes("amqp-manager.editConnection"));
		assert.ok(commands.includes("amqp-manager.removeConnection"));
		assert.ok(commands.includes("amqp-manager.refreshActiveConnection"));
		assert.ok(commands.includes("amqp-manager.listQueueMessages"));
		assert.ok(commands.includes("amqp-manager.publishQueue"));
		assert.ok(commands.includes("amqp-manager.publishExchange"));
	});
});
