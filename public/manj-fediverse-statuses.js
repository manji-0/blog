(function () {
	const SNAPSHOT_URL = '/fediverse-statuses.json';
	const LIVE_URL = 'https://fedi.manji.app/users/manji0/statuses';

	const formatter = new Intl.DateTimeFormat('ja-JP', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Asia/Tokyo',
	});

	function normalizeStatuses(payload) {
		const statuses = Array.isArray(payload) ? payload : payload.statuses;
		if (!Array.isArray(statuses)) return [];

		return statuses
			.filter((status) => !status.reblog && (status.visibility ? status.visibility === 'public' : true))
			.slice(0, 5)
			.map((status) => ({
				id: status.id,
				url: status.url || status.uri || LIVE_URL,
				created_at: status.created_at,
				text: status.text || '',
			}));
	}

	function renderStatus(status) {
		const article = document.createElement('article');
		article.className = 'fediverse-status';

		const meta = document.createElement('a');
		meta.className = 'fediverse-status__meta';
		meta.href = status.url || LIVE_URL;
		meta.rel = 'noopener noreferrer';
		meta.target = '_blank';
		meta.textContent = formatter.format(new Date(status.created_at));

		const text = document.createElement('p');
		text.className = 'fediverse-status__text';
		text.textContent = status.text || '';

		article.append(meta, text);
		return article;
	}

	function render(container, statuses) {
		if (!statuses.length) throw new Error('statuses are empty');
		container.replaceChildren(...statuses.map(renderStatus));
	}

	async function loadSnapshot() {
		const response = await fetch(SNAPSHOT_URL, { cache: 'no-cache' });
		if (!response.ok) throw new Error('snapshot ' + response.status);
		return normalizeStatuses(await response.json());
	}

	async function loadLive() {
		const response = await fetch(LIVE_URL, {
			headers: { Accept: 'application/json' },
		});
		if (!response.ok) throw new Error('live ' + response.status);
		return normalizeStatuses(await response.json());
	}

	function showError(container) {
		const fallback = document.createElement('p');
		fallback.className = 'fediverse-statuses__error';
		fallback.textContent = 'Could not load statuses right now.';
		container.replaceChildren(fallback);
	}

	function mount() {
		const container = document.querySelector('[data-fediverse-statuses]');
		if (!container) return;

		loadSnapshot()
			.then((statuses) => {
				render(container, statuses);
				return loadLive()
					.then((liveStatuses) => render(container, liveStatuses))
					.catch(() => {
						/* snapshot is enough */
					});
			})
			.catch(() => {
				return loadLive()
					.then((liveStatuses) => render(container, liveStatuses))
					.catch(() => showError(container));
			});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', mount);
	} else {
		mount();
	}
})();
