import { access, readFile } from "node:fs/promises";
import path from "node:path";

type PackageManifest = {
	name: string;
	displayName: string;
	version: string;
	publisher?: string;
	license?: string;
	icon?: string;
};

const rootDirectory = process.cwd();
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

async function fileExists(relativePath: string): Promise<void> {
	await access(path.join(rootDirectory, relativePath));
}

function parsePackageManifest(content: string): PackageManifest {
	return JSON.parse(content) as PackageManifest;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRequestedTag(): string | undefined {
	const explicitTag = process.argv[2];
	if (explicitTag) {
		return explicitTag;
	}

	const githubTag = process.env.GITHUB_REF_NAME;
	if (githubTag?.startsWith("v")) {
		return githubTag;
	}

	return undefined;
}

async function main(): Promise<void> {
	const [packageJson, changelog] = await Promise.all([
		readFile(path.join(rootDirectory, "package.json"), "utf8"),
		readFile(path.join(rootDirectory, "CHANGELOG.md"), "utf8"),
	]);

	const manifest = parsePackageManifest(packageJson);
	const errors: string[] = [];

	if (!versionPattern.test(manifest.version)) {
		errors.push(
			`package.json version "${manifest.version}" is not a valid release version.`,
		);
	}

	if (!manifest.publisher) {
		errors.push(
			"package.json is missing the publisher field required by the VS Code Marketplace.",
		);
	}

	if (!manifest.license) {
		errors.push("package.json is missing the license field.");
	}

	if (!manifest.icon) {
		errors.push("package.json is missing the icon field.");
	}

	const changelogSectionPattern = new RegExp(
		`^## \\[${escapeRegExp(manifest.version)}\\](?:\\s+-\\s+\\d{4}-\\d{2}-\\d{2})?$`,
		"m",
	);

	if (!changelogSectionPattern.test(changelog)) {
		errors.push(
			`CHANGELOG.md is missing a section for version ${manifest.version}.`,
		);
	}

	const expectedFiles = ["README.md", "CHANGELOG.md", "LICENSE"];
	if (manifest.icon) {
		expectedFiles.push(manifest.icon);
	}

	for (const relativePath of expectedFiles) {
		try {
			await fileExists(relativePath);
		} catch {
			errors.push(`Required release file not found: ${relativePath}`);
		}
	}

	const requestedTag = getRequestedTag();
	if (requestedTag && requestedTag !== `v${manifest.version}`) {
		errors.push(
			`Git tag ${requestedTag} does not match package.json version v${manifest.version}.`,
		);
	}

	if (
		process.env.GITHUB_ACTIONS === "true" &&
		requestedTag &&
		!process.env.VSCE_PAT
	) {
		errors.push("VSCE_PAT secret is missing for Marketplace publishing.");
	}

	if (errors.length > 0) {
		for (const error of errors) {
			console.error(`[release] ${error}`);
		}
		process.exit(1);
	}

	console.log(
		`[release] ${manifest.displayName} ${manifest.version} passed release validation.`,
	);
	if (requestedTag) {
		console.log(`[release] Tag: ${requestedTag}`);
	}
	console.log(
		`[release] Channel: ${manifest.version.includes("-") ? "pre-release" : "stable"}`,
	);
}

void main().catch((error) => {
	console.error("[release] Unhandled validation failure", error);
	process.exit(1);
});
