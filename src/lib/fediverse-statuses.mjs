export const LATEST_STATUSES_ENDPOINT = 'https://latest-statuses.manji.app/statuses';

const STATUS_LIMIT = 5;

function normalizeStatus(status) {
	return {
		id: status.id,
		source: status.source || 'fediverse',
		url: status.url || status.uri || LATEST_STATUSES_ENDPOINT,
		created_at: status.created_at,
		text: status.text || '',
	};
}

export function normalizeFediverseStatuses(statuses) {
	if (!Array.isArray(statuses)) {
		throw new Error('Fediverse statuses response was not an array');
	}

	return statuses
		.filter((status) => !status.reblog && (status.visibility ? status.visibility === 'public' : true))
		.slice(0, STATUS_LIMIT)
		.map(normalizeStatus);
}

export async function fetchFediverseStatuses() {
	const response = await fetch(LATEST_STATUSES_ENDPOINT, {
		headers: { Accept: 'application/json' },
	});

	if (!response.ok) {
		throw new Error(`Latest statuses fetch failed with status ${response.status}`);
	}

	return {
		fetchedAt: new Date().toISOString(),
		statuses: normalizeFediverseStatuses(await response.json()),
	};
}
