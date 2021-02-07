import { ID365Note } from "./interfaces/d365Note";
import { ID365WebFile } from "./interfaces/d365WebFile";
import * as mime from 'mime-types';
import { IPortalDataDocument } from "./interfaces/dataDocument";
import { WebPage } from "./webPage";

export const DEFAULT_MIME_TYPE = 'application/octet-stream';

export class WebFile implements IPortalDataDocument {

	public name: string;
	public id: string;
	public fullPath: string;
	public filePath: string;
	private _parentWebPage: WebPage | undefined;
	private _d365File: ID365WebFile;
	private _d365Note: ID365Note;

	constructor(webFile: ID365WebFile, webNote: ID365Note, parentWebPage: WebPage | undefined) {
		this.id = webFile.adx_webfileid || '';
		this.name = webFile.adx_name;
		this._d365Note = webNote;
		this._d365File = webFile;
		this._parentWebPage = parentWebPage;

		if (!this._parentWebPage) {
			this.fullPath = this.name;
			this.filePath = '';
		} else {
			this.fullPath = this._parentWebPage.getFullPath() + '/' + this.name;
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

	public static getWebFile(webFile: ID365WebFile, webNote: ID365Note, webPageHierachy: Map<string, WebPage>): WebFile {
		let parentPage: WebPage | undefined = undefined;
		if (webFile._adx_parentpageid_value && webPageHierachy.has(webFile._adx_parentpageid_value)) {
			parentPage = webPageHierachy.get(webFile._adx_parentpageid_value);
		}

		return new WebFile(webFile, webNote, parentPage);
	}
}

export function getMimeType(fileName: string): string {
	return mime.lookup(fileName) || DEFAULT_MIME_TYPE;
}