import { Uri } from "vscode";
import { getFilename, getFileType } from "../scm/portalSourceControl";
import { ContentSnippet } from "./ContentSnippet";
import { WebFile } from "./WebFile";
import { WebTemplate } from "./WebTemplate";

export class PortalData {

	public instanceName: string;
	public portalName: string;
	public data: IPortalDocuments;


	constructor(instanceName: string, portalName: string) {
		this.instanceName = instanceName;
		this.portalName = portalName;
		this.data = {
			contentSnippet: new Map<string, ContentSnippet>(),
			webFile: new Map<string, WebFile>(),
			webTemplate: new Map<string, WebTemplate>()
		};
	}

	public getDocumentContent(uri: Uri): string | undefined {
		const fileName = getFilename(uri);
		const fileType = getFileType(uri);
		switch (fileType) {
			case PortalFileType.contentSnippet:
				return this.data.contentSnippet.get(fileName)?.source;
			case PortalFileType.webTemplate:
				return this.data.webTemplate.get(fileName)?.source;
			default:
				return;
		}
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