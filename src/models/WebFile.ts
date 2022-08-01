import * as mime from 'mime-types';

import { ID365Note } from "./interfaces/d365Note";
import { ID365WebFile } from "./interfaces/d365WebFile";
import { IPortalDataDocument } from "./interfaces/dataDocument";
import { WebPage } from "./webPage";

export const DEFAULT_MIME_TYPE = 'application/octet-stream';

export class WebFile implements IPortalDataDocument {

	public isFolderMode: boolean;

	public name: string;
	public id: string;
	public fullPath: string;
	public filePath: string;
	private _parentWebPage: WebPage | undefined;
	private _d365File: ID365WebFile;
	private _d365Note: ID365Note;

	constructor(isFolderMode: boolean, webFile: ID365WebFile, webNote: ID365Note, parentWebPage: WebPage | undefined) {
		this.isFolderMode = isFolderMode;
		
		this.id = webFile.adx_webfileid || '';
		this.name = webFile.adx_name;
		this._d365Note = webNote;
		this._d365File = webFile;
		this._parentWebPage = parentWebPage;

		if (!this._parentWebPage) {
			this.fullPath = this.name;
			this.filePath = '';
		} else {
			this.fullPath = this._parentWebPage.getFullPath() + '/' + this._d365Note.filename;
			this.filePath = this._parentWebPage.getFullPath();
		}

		if (!this._d365Note.mimetype || this._d365Note.mimetype === DEFAULT_MIME_TYPE) {
			this._d365Note.mimetype = getMimeType(this._d365Note.filename);
		}		
	}
	
	set d365Note (note: ID365Note) {
		this._d365Note = note;
		this._d365Note.mimetype = getMimeType(note.filename);
	}

	get d365Note(): ID365Note {
		return this._d365Note;
	}

	set b64Content(b64Content: string) {
		this.d365Note.documentbody = b64Content;
	}

	get b64Content(): string {
		return this._d365Note.documentbody;
	}

	get d365File(): ID365WebFile {
		return this._d365File;
	}

	get fileId(): string {
		return this.isFolderMode ? this.fullPath.toLowerCase() : '/' + this._d365Note.filename.toLowerCase();
	}

	public static getWebFile(isFolderMode: boolean, webFile: ID365WebFile, webNote: ID365Note, webPageHierarchy: Map<string, WebPage>): WebFile {
		let parentPage: WebPage | undefined = undefined;
		if (webFile._adx_parentpageid_value && webPageHierarchy.has(webFile._adx_parentpageid_value)) {
			parentPage = webPageHierarchy.get(webFile._adx_parentpageid_value);
		}

		return new WebFile(isFolderMode, webFile, webNote, parentPage);
	}
}

export function getMimeType(fileName: string): string {
	return mime.lookup(fileName) || DEFAULT_MIME_TYPE;
}