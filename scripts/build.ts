import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const isProduction = process.argv.includes("--production");
const rootDirectory = process.cwd();
const outputDirectory = path.join(rootDirectory, "dist");

/**
 * Bundles the extension entrypoint with Bun while keeping the VS Code runtime external.
 */
async function main(): Promise<void> {
	console.log(
		`[build] Starting ${isProduction ? "production" : "development"} bundle with Bun`,
	);

	await rm(outputDirectory, { recursive: true, force: true });
	await mkdir(outputDirectory, { recursive: true });

	const extensionBuild = await Bun.build({
		entrypoints: [path.join(rootDirectory, "src", "extension.ts")],
		outdir: outputDirectory,
		target: "node",
		format: "cjs",
		root: path.join(rootDirectory, "src"),
		naming: {
			entry: "extension.js",
		},
		external: ["vscode"],
		minify: isProduction,
		sourcemap: isProduction ? "none" : "external",
		throw: false,
	});

	if (!extensionBuild.success) {
		for (const log of extensionBuild.logs) {
			console.error(`[build] ${log.level.toUpperCase()}: ${log.message}`);
			for (const position of log.position ?? []) {
				console.error(
					`[build] ${position.file}:${position.line}:${position.column}`,
				);
			}
		}
		process.exit(1);
	}

	for (const output of extensionBuild.outputs) {
		console.log(`[build] Wrote ${output.path}`);
	}

	const webviewBuild = await Bun.build({
		entrypoints: [
			path.join(rootDirectory, "src", "ui", "webview", "resourceEditorApp.ts"),
		],
		outdir: outputDirectory,
		target: "browser",
		format: "iife",
		root: path.join(rootDirectory, "src", "ui", "webview"),
		naming: {
			entry: "webview/[name].js",
			asset: "webview/[name].[ext]",
			chunk: "webview/[name]-[hash].js",
		},
		minify: isProduction,
		sourcemap: isProduction ? "none" : "external",
		throw: false,
	});

	if (!webviewBuild.success) {
		for (const log of webviewBuild.logs) {
			console.error(`[build] ${log.level.toUpperCase()}: ${log.message}`);
			for (const position of log.position ?? []) {
				console.error(
					`[build] ${position.file}:${position.line}:${position.column}`,
				);
			}
		}
		process.exit(1);
	}

	for (const output of webviewBuild.outputs) {
		console.log(`[build] Wrote ${output.path}`);
	}

	console.log("[build] Bundle finished");
}

void main().catch((error) => {
	console.error("[build] Unhandled build failure", error);
	process.exit(1);
});
