import { ID365Note } from "./interfaces/d365Note";
import { ID365WebFile } from "./interfaces/d365WebFile";
import * as mime from 'mime-types';

export const DEFAULT_MIME_TYPE = 'application/octet-stream';

export class WebFile {

	public name: string;
	public id: string;
	private _d365File: ID365WebFile;
	private _d365Note: ID365Note;

	constructor(webFile: ID365WebFile, webNote: ID365Note) {
		this.id = webFile.adx_webfileid || '';
		this.name = webFile.adx_name;
		this._d365Note = webNote;
		this._d365File = webFile;
		if (!this._d365Note.mimetype || this._d365Note.mimetype === DEFAULT_MIME_TYPE) {
			this._d365Note.mimetype = mime.lookup(this._d365Note.filename) || DEFAULT_MIME_TYPE;
		}		
	}
	
	set d365Note (note: ID365Note) {
		this._d365Note = note;
		this._d365Note.mimetype = mime.lookup(note.filename) || DEFAULT_MIME_TYPE;
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

	
}