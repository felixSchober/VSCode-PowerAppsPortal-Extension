import fs = require('fs');
import path = require('path');

export class Utils {
	static readFileAsync(filepath: string): Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			fs.readFile(filepath, (error, data) => {
				if (error) {
					reject(error);
				} else {
					resolve(data);
				}
			});
		});
	}

	static writeFileAsync(filepath: string, fileContents: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.writeFile(filepath, fileContents, (error) => {
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	static createFolder(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			if (!fs.existsSync(path)) {
				fs.mkdir(path, (err) => {
					if (err) {
						reject(`Could not create folder for path ${path} due to error: ${err}`);
					}
					resolve();
				});
			}
		});
	}

	// static findFilesForPath(pathname: string): string[] {
	// 	// check if path exists
	// 	if (!fs.existsSync(pathname)) {
	// 		throw Error('Could not find path ' + pathname);
	// 	}

	// 	const fullPaths: string[] = tl.ls('-A', [pathname]);
	// 	const baseNames: string[] = [];
	// 	for (let i = 0; i < fullPaths.length; i++) {
	// 		baseNames[i] = path.basename(fullPaths[i]);
	// 	}
	// 	return baseNames;
	// }

	static toLookup<T>(input: Array<T>, keyLookupParameter: (type: T) => string): { [id: string]: T } {
		const result: { [id: string]: T } = {};

		for (const e of input) {
			const key = keyLookupParameter(e);
			result[key] = e;
		}
		return result;
	}

	static isGuid(guid: string): boolean {
		const result = guid.match('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');
		if (result === null) {
			return false;
		}
		return true;
	}

	static firstIndex<T>(array: T[], fn: (t: T) => boolean): number {
		for (let i = 0; i < array.length; i++) {
			if (fn(array[i])) {
				return i;
			}
		}
	
		return -1;
	}
}
