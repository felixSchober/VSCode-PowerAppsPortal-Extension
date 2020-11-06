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

	public fileExists(uri: Uri): boolean {
		const fileType = getFileType(uri);
		let fileName = getFilename(uri, fileType);

		switch (fileType) {
			case PortalFileType.contentSnippet:
				fileName = fileName.replace(/_/g, '/');
				return this.data.contentSnippet.has(fileName);
			case PortalFileType.webTemplate:
				return this.data.webTemplate.has(fileName);
			case PortalFileType.webFile:
				return this.data.webFile.has(fileName);
			default:
				return false;
		}
	}

	public getDocumentContent(uri: Uri, fileAsBase64: boolean = false): string {
		const fileType = getFileType(uri);
		let fileName = getFilename(uri, fileType);

		switch (fileType) {
			case PortalFileType.contentSnippet:
				return this.getContentSnippet(uri)?.source || '';
			case PortalFileType.webTemplate:
				return this.getWebTemplate(uri)?.source || '';
			case PortalFileType.webFile:
				const content = this.getWebFile(uri)?.b64Content || '';
				if (fileAsBase64) {
					return content;
				}
				const decodedContent = Buffer.from(content, BASE64).toString();
				return decodedContent;
			default:
				return '';
		}
	}

	public getContentSnippet(uri: Uri): ContentSnippet | undefined {
		let fileName = getFilename(uri, PortalFileType.contentSnippet);
		return this.data.contentSnippet.get(fileName);
	}

	public getWebTemplate(uri: Uri): WebTemplate | undefined {
		let fileName = getFilename(uri, PortalFileType.webTemplate);
		return this.data.webTemplate.get(fileName);
	}

	public getWebFile(uri: Uri): WebFile | undefined {
		let fileName = getFilename(uri, PortalFileType.webFile);
		return this.data.webFile.get(fileName);
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
	other
}
