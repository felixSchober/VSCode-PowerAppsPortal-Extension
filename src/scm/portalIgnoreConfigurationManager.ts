import { Uri } from "vscode";
import { getFileExtension } from "../models/portalData";

export class PortalIgnoreConfigurationManager {

	private fileExtIgnoreList = [
		'ds_store'
	];

	isIgnored(uri: Uri): boolean {
		const ext = getFileExtension(uri);

		if (!ext) {
			return false;
		}

		if (this.fileExtIgnoreList.includes(ext.toLowerCase())) {
			return true;
		}
		return false;
	}
}