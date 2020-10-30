import { Uri } from 'vscode';
import { BASE64 } from '../scm/afs';
import { getFilename, getFileType } from '../scm/portalSourceControl';
import { ContentSnippet } from './ContentSnippet';
import { WebFile } from './WebFile';
import { WebTemplate } from './WebTemplate';

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
			webTemplate: new Map<string, WebTemplate>(),
		};
	}

	public getDocumentContent(uri: Uri, fileAsBase64: boolean = false): string {
		const fileType = getFileType(uri);
		let fileName = getFilename(uri, fileType);

		switch (fileType) {
			case PortalFileType.contentSnippet:
				fileName = fileName.replace(/_/g, '/');

				return this.data.contentSnippet.get(fileName)?.source || '';
			case PortalFileType.webTemplate:
				return this.data.webTemplate.get(fileName)?.source || '';
			case PortalFileType.webFile:
				const content = this.data.webFile.get(fileName)?.b64Content || '';
				if (fileAsBase64) {
					return content;
				}
				const decodedContent = Buffer.from(content, BASE64).toString();
				return decodedContent;
			default:
				return '';
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
	webTemplate,
}
