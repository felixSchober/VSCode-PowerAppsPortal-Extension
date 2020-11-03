export interface ID365ContentSnippet {
	adx_contentsnippetid: string;
	adx_name: string;
	adx_value: string;
	versionnumber: number;
	_adx_contentsnippetlanguageid_value: string;
}

export const CONTENTSNIPPET_SELECT = [
	'adx_name',
	'adx_value',
	'adx_contentsnippetid',
	'versionnumber',
	'_adx_contentsnippetlanguageid_value',
];