export const FEDIVERSE_STATUSES_ENDPOINT = 'https://fedi.manji.app/users/manji0/statuses';

const STATUS_LIMIT = 5;

function normalizeStatus(status) {
	return {
		id: status.id,
		url: status.url || status.uri || FEDIVERSE_STATUSES_ENDPOINT,
		created_at: status.created_at,
		text: status.text || '',
	};
}

export function normalizeFediverseStatuses(statuses) {
	if (!Array.isArray(statuses)) {
		throw new Error('Fediverse statuses response was not an array');
	}

	return statuses
		.filter((status) => !status.reblog && status.visibility === 'public')
		.slice(0, STATUS_LIMIT)
		.map(normalizeStatus);
}

export async function fetchFediverseStatuses() {
	const response = await fetch(FEDIVERSE_STATUSES_ENDPOINT, {
		headers: { Accept: 'application/json' },
	});

	if (!response.ok) {
		throw new Error(`Fediverse statuses fetch failed with status ${response.status}`);
	}

	return {
		fetchedAt: new Date().toISOString(),
		statuses: normalizeFediverseStatuses(await response.json()),
	};
}
