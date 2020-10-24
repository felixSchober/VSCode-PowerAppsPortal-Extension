import { ID365Note } from "./interfaces/d365Note";
import { ID365WebFile } from "./interfaces/d365WebFile";

export class WebFile {

	public name: string;
	public id: string;
	public b64Content: string;
	public d365File: ID365WebFile;
	public d365Note: ID365Note;

	constructor(webFile: ID365WebFile, webNote: ID365Note) {
		this.id = webFile.adx_webfileid || '';
		this.name = webFile.adx_name;
		this.b64Content = webNote.documentbody;
		this.d365Note = webNote;
		this.d365File = webFile;
	}
}