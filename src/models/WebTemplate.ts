import { ID365WebTemplate } from "./interfaces/d365WebTemplate";

export class WebTemplate {
	public name: string;
	public source: string;
	public id: string;

	constructor(template: ID365WebTemplate) {
		this.name = template.adx_name;
		this.source = template.adx_source;
		this.id = template.adx_webtemplateid;
	}
}