import * as fs from "node:fs";
import * as path from "node:path";

import Mocha from "mocha";

export function run(): Promise<void> {
	const mocha = new Mocha({
		ui: "tdd",
		color: true,
	});

	const testsRoot = path.resolve(__dirname, "..");

	return new Promise((resolve, reject) => {
		try {
			for (const file of findTestFiles(testsRoot)) {
				mocha.addFile(file);
			}

			mocha.run((failures) => {
				if (failures > 0) {
					reject(new Error(`${failures} test(s) failed.`));
					return;
				}

				resolve();
			});
		} catch (error) {
			reject(error);
		}
	});
}

function findTestFiles(directory: string): string[] {
	const files: string[] = [];

	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const target = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...findTestFiles(target));
			continue;
		}

		if (entry.isFile() && entry.name.endsWith(".test.js")) {
			files.push(target);
		}
	}

	return files;
}
