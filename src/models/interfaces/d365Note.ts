/* eslint-disable @typescript-eslint/naming-convention */
export interface ID365Note {

	annotationid: string | undefined;
	_objectid_value: string | undefined;
	filename: string;
	isdocument: boolean;
	documentbody: string;
	mimetype: string;
}

export const NOTE_SELECT = ['annotationid', 'filename', 'isdocument', 'documentbody', 'versionnumber', '_objectid_value', 'mimetype'];