import { Uri } from 'vscode';
import { BASE64 } from '../scm/afs';
import { ContentSnippet } from './ContentSnippet';
import { WebFile } from './WebFile';
import { WebTemplate } from './WebTemplate';
import path = require('path');
import { FOLDER_CONTENT_SNIPPETS, FOLDER_TEMPLATES, FOLDER_WEB_FILES } from '../scm/portalRepository';
import { ID365PortalLanguage } from './interfaces/d365Language';
import { WebPage } from './webPage';

export class PortalData {
	public instanceName: string;
	public portalName: string;
	public data: IPortalDocuments;
	public languages = new Map<string, ID365PortalLanguage>();
	public publishedStateId: string | undefined;
	public webPages: Map<string, WebPage>;

	constructor(instanceName: string, portalName: string) {
		this.instanceName = instanceName;
		this.portalName = portalName;
		this.webPages = new Map<string, WebPage>();

		this.data = {
			contentSnippet: new Map<string, ContentSnippet>(),
			webFile: new Map<string, WebFile>(),
			webTemplate: new Map<string, WebTemplate>(),
		};
	}

	public get numberOfDocuments(): number {
		return this.data.contentSnippet.size + this.data.webFile.size + this.data.webTemplate.size;
	}

	public fileExists(uri: Uri): boolean {
		const fileType = getFileType(uri);
		let fileId = getFileIdFromUri(uri, fileType);

		switch (fileType) {
			case PortalFileType.contentSnippet:
				return this.data.contentSnippet.has(fileId);
			case PortalFileType.webTemplate:
				return this.data.webTemplate.has(fileId);
			case PortalFileType.webFile:
				return this.data.webFile.has(fileId);
			default:
				return false;
		}
	}

	public getDocumentContent(uri: Uri, fileAsBase64: boolean = false): string {
		const fileType = getFileType(uri);

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
		let fileName = getFileIdFromUri(uri, PortalFileType.contentSnippet);
		return this.data.contentSnippet.get(fileName);
	}

	public getWebTemplate(uri: Uri): WebTemplate | undefined {
		let fileName = getFileIdFromUri(uri, PortalFileType.webTemplate);
		return this.data.webTemplate.get(fileName);
	}

	public getWebFile(uri: Uri): WebFile | undefined {
		let fileName = getFileIdFromUri(uri, PortalFileType.webFile);
		return this.data.webFile.get(fileName);
	}

	public getRootWebPage(): WebPage | undefined {
		if (this.webPages.size === 0) {
			return undefined;
		}

		for (const page of this.webPages.values()) {
			if (!page.parentId) {
				return page;
			}
		}

		return undefined;
	}

	public getWebPage(uri: Uri): WebPage | undefined {
		const folders = path.dirname(uri.fsPath).split(path.sep);
		return this.getWebPageFromPartialFilePath(folders);
	}

	public getWebPageFromPartialFilePath(folders: string[]): WebPage | undefined {
		const folderName = folders[folders.length - 1];

		if (folderName === FOLDER_WEB_FILES) {
			return this.getRootWebPage();
		}

		// try to find this web page based on folder name
		let parentWebPage: WebPage | undefined;
		for (const webPage of this.webPages.values()) {
			if (webPage.url === folderName) {
				parentWebPage = webPage;
				break;
			}
		}

		return parentWebPage;
	}

	public getLanguageObjectFromPath(uri: Uri): [string, ID365PortalLanguage] | undefined {
		// return language id based on the path

		if (this.languages.size === 0) {
			throw Error('Could not get language from path because languages are not defined. Try to restart vscode.');
		}
		const filePathComponents = uri.fsPath.split(path.sep);
		// find something like en-us in the path
		for (const [languageId, languageObj] of this.languages.entries()) {
			const foundCodeInPath = filePathComponents.includes(languageObj.adx_languagecode.toLocaleLowerCase());
			if (foundCodeInPath) {
				console.log(`[PORTAL DATA] Detected language ${languageObj.adx_displayname} for path ${uri.fsPath}`);
				return [languageId, languageObj];
			}
		}

		// return default, which is language not specified
		return undefined;
	}
}

/**
 * Get the name of the file
 * @param uri document uri
 */
export function getFileIdFromUri(uri: Uri, fileType?: PortalFileType): string {
	if (fileType && fileType === PortalFileType.webFile) {
		const folders = uri.fsPath.split(path.sep);
		const webFileIndex = folders.indexOf(FOLDER_WEB_FILES);
		const fileName = folders.slice(webFileIndex + 1);
		const fn = '/' + fileName.join('/');
		return fn.toLowerCase();
	}

	if (fileType === PortalFileType.contentSnippet) {
		// get base path up from FOLDER_CONTENT_SNIPPETS
		const folders = uri.fsPath.split(path.sep);
		const contentSnippetIndex = folders.indexOf(FOLDER_CONTENT_SNIPPETS);
		// const fileName = [...folders.slice(contentSnippetIndex + 1, folders.length - 2), folders[folders.length - 1]];
		const fileName = folders.slice(contentSnippetIndex + 1);
		const fn = fileName.join('/').split('.')[0];
		return fn.toLowerCase();
	}
	return path.basename(uri.fsPath).split('.')[0].toLowerCase();
}

export function getFileName(uri: Uri, fileType?: PortalFileType): string {
	if (fileType && fileType === PortalFileType.webFile) {
		return path.basename(uri.fsPath).toLowerCase();
	}

	return getFileIdFromUri(uri, fileType);
}

export function getFileType(uri: Uri): PortalFileType {
	const folders = path.dirname(uri.fsPath).split(path.sep);

	if (folders.includes(FOLDER_CONTENT_SNIPPETS)) {
		return PortalFileType.contentSnippet;
	}

	if (folders.includes(FOLDER_TEMPLATES)) {
		return PortalFileType.webTemplate;
	}

	if (folders.includes(FOLDER_WEB_FILES)) {
		return PortalFileType.webFile;
	}

	return PortalFileType.other;
}

export function getFileExtension(uri: Uri): string {
	var ext = (uri.fsPath||'').split('.');
    return ext[ext.length - 1];
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
