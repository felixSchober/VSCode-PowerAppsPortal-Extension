import * as vscode from 'vscode';

import { PowerAppsPortalSourceControl } from "./portalSourceControl";

export class RepositoryPick implements vscode.QuickPickItem {

	constructor(public readonly fiddleSourceControl: PowerAppsPortalSourceControl) { }

	get label(): string {
		return this.fiddleSourceControl.getSourceControl().label;
	}
}