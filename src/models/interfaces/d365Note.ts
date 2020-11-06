/* eslint-disable @typescript-eslint/naming-convention */
export interface ID365Note {

	annotationid: string | undefined;
	_objectid_value: string;
	filename: string;
	isdocument: boolean;
	documentbody: string;
	filesize: number;
	versionnumber: number;
	mimetype: string;
}

export const NOTE_SELECT = ['annotationid', 'filename', 'isdocument', 'documentbody', 'filesize', 'versionnumber', '_objectid_value', 'mimetype'];