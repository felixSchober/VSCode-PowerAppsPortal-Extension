import { IPortalDataDocument } from "./interfaces/dataDocument";

export class ContentSnippet implements IPortalDataDocument {
	constructor(
		public source: string,
		public language: string,
		public version: number,
		public id: string,
		public name: string
	) {}
}
