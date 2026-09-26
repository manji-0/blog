export const profile = {
	familyName: '萬治',
	givenName: '渉',
	name: '萬治 渉',
	handle: 'manji0',
	nickname: 'まんじまる',
	email: 'manji@linux.com',
	workEmail: 'w.manji@kakehashi.life',
	org: 'KAKEHASHI Inc.',
	site: 'https://www.manj.io/',
	github: 'https://github.com/manji-0',
	x: 'https://x.com/_manji0',
	fediverse: 'https://fedi.manji.app/users/manji0',
	fediverseHandle: '@manji0@fedi.manji.app',
} as const;

export const VCARD_PATH = '/card/manji0.vcf';

export function buildVcard(): string {
	return [
		'BEGIN:VCARD',
		'VERSION:3.0',
		`N:${profile.familyName};${profile.givenName};;;`,
		`FN:${profile.name}`,
		`NICKNAME:${profile.handle}`,
		`ORG:${profile.org}`,
		`EMAIL;TYPE=INTERNET,HOME:${profile.email}`,
		`EMAIL;TYPE=INTERNET,WORK:${profile.workEmail}`,
		`URL:${profile.site}`,
		`URL:${profile.github}`,
		`URL:${profile.x}`,
		`URL:${profile.fediverse}`,
		'END:VCARD',
		'',
	].join('\r\n');
}
