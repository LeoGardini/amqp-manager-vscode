import { readFile } from "node:fs/promises";
import path from "node:path";

type PackageManifest = {
	displayName: string;
	version: string;
};

const rootDirectory = process.cwd();

function extractReleaseNotes(changelog: string, version: string): string {
	const versionHeader = `## [${version}]`;
	const startIndex = changelog.indexOf(versionHeader);

	if (startIndex === -1) {
		throw new Error(
			`Could not find release notes for version ${version} in CHANGELOG.md`,
		);
	}

	const contentStart = changelog.indexOf("\n", startIndex);
	if (contentStart === -1) {
		throw new Error(`Release notes section for version ${version} is empty.`);
	}

	const nextSectionIndex = changelog.indexOf("\n## [", contentStart + 1);
	const contentEnd =
		nextSectionIndex === -1 ? changelog.length : nextSectionIndex;

	return changelog.slice(contentStart, contentEnd).trim();
}

async function main(): Promise<void> {
	const [packageJson, changelog] = await Promise.all([
		readFile(path.join(rootDirectory, "package.json"), "utf8"),
		readFile(path.join(rootDirectory, "CHANGELOG.md"), "utf8"),
	]);

	const manifest = JSON.parse(packageJson) as PackageManifest;
	const notes = extractReleaseNotes(changelog, manifest.version);

	process.stdout.write(
		`# ${manifest.displayName} v${manifest.version}\n\n${notes}\n`,
	);
}

void main().catch((error) => {
	console.error("[release] Failed to render release notes", error);
	process.exit(1);
});
