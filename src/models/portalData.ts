import { ContentSnippet } from "./ContentSnippet";
import { WebFile } from "./WebFile";
import { WebTemplate } from "./WebTemplate";

export class PortalData {

	public instanceName: string;
	public data: IPortalDocuments;


	constructor(instanceName: string) {
		this.instanceName = instanceName;
		this.data = {
			contentSnippet: new Map<string, ContentSnippet>(),
			webFile: new Map<string, WebFile>(),
			webTemplate: new Map<string, WebTemplate>()
		};
	}
}

export interface IPortalDocuments {
	contentSnippet: Map<string, ContentSnippet>;
	webFile: Map<string, WebFile>;
	webTemplate: Map<string, WebTemplate>;
}

export enum PortalFileType {
	contentSnippet,
	webFile,
	webTemplate
}