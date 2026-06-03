(function () {
	const SNAPSHOT_URL = '/github-pages-uptime.json';
	const STATUS_HOME_URL = 'https://www.githubstatus.com/';
	const PAGES_COMPONENT_ID = 'vg70hn9s2tyj';
	const DAY_COUNT = 30;

	const FILL_TO_STATE = {
		'#28a745': 'ok',
		'#bdae13': 'warn',
		'#e3600b': 'warn',
		'#d73a49': 'bad',
		'#dc3545': 'bad',
		'#6c757d': 'maint',
	};

	function parseUptime(html) {
		const statusMatch = html.match(
			new RegExp(
				'data-component-id="' + PAGES_COMPONENT_ID + '"[\\s\\S]*?data-component-status="([^"]+)"',
			),
		);
		const svgMatch = html.match(
			new RegExp('id="uptime-component-' + PAGES_COMPONENT_ID + '"[^>]*>([\\s\\S]*?)</svg>'),
		);
		if (!svgMatch) throw new Error('uptime graph missing');

		const days = [];
		const fillPattern = /fill="([^"]+)"/g;
		let match = fillPattern.exec(svgMatch[1]);
		while (match) {
			const fill = match[1].toLowerCase();
			days.push({ fill, state: FILL_TO_STATE[fill] || 'unknown' });
			match = fillPattern.exec(svgMatch[1]);
		}

		const percentMatch = html.match(
			new RegExp(
				'id="uptime-percent-' +
					PAGES_COMPONENT_ID +
					'"[\\s\\S]*?<var[^>]*>([\\d.]+)</var>',
			),
		);

		return {
			percent: percentMatch ? percentMatch[1] : '',
			days,
			status: statusMatch ? statusMatch[1] : 'unknown',
		};
	}

	function formatPercent(percent) {
		if (!percent) return '—';
		return percent.includes('%') ? percent : percent + '%';
	}

	function statusLabel(status) {
		switch (status) {
			case 'operational':
				return 'operational';
			case 'degraded_performance':
				return 'degraded';
			case 'partial_outage':
				return 'partial outage';
			case 'major_outage':
				return 'major outage';
			default:
				return status || 'unknown';
		}
	}

	const GRID_GAP_PX = 1;
	const GRID_MIN_CELL_PX = 3;

	/** @type {ResizeObserver | null} */
	let gridResizeObserver = null;

	function columnCountForWidth(widthPx) {
		if (widthPx <= 0) return 15;
		return Math.min(
			15,
			Math.max(10, Math.floor((widthPx + GRID_GAP_PX) / (GRID_MIN_CELL_PX + GRID_GAP_PX))),
		);
	}

	function percentFromDays(days) {
		if (!days.length) return '';
		const ok = days.filter((day) => day.state === 'ok').length;
		return ((ok / days.length) * 100).toFixed(2);
	}

	function updateUptimeGridColumns(bars) {
		const panel = bars.closest('.right-sidebar-panel');
		const sidebarFooter = bars.closest('.right-sidebar > .manj-system-map-footer');
		const widthSource = panel?.querySelector('.sl-container') ?? sidebarFooter ?? bars;
		const width = widthSource.getBoundingClientRect().width;
		bars.style.setProperty('--manj-uptime-cols', String(columnCountForWidth(width)));
	}

	function bindResponsiveUptimeGrid(footer) {
		const bars = footer.querySelector('.manj-uptime-bars');
		if (!bars || bars.dataset.manjUptimeGridBound === '1') return;
		bars.dataset.manjUptimeGridBound = '1';

		const scheduleUpdate = () => {
			requestAnimationFrame(() => updateUptimeGridColumns(bars));
		};

		scheduleUpdate();

		const panel = footer.closest('.right-sidebar-panel');
		const sidebarFooter = footer.matches('.right-sidebar > .manj-system-map-footer') ? footer : null;
		const observeTarget = panel?.querySelector('.sl-container') ?? sidebarFooter ?? bars;

		if (typeof ResizeObserver !== 'undefined') {
			gridResizeObserver?.disconnect();
			gridResizeObserver = new ResizeObserver(scheduleUpdate);
			gridResizeObserver.observe(observeTarget);
			if (observeTarget !== bars) gridResizeObserver.observe(bars);
		}

		window.addEventListener('resize', scheduleUpdate, { passive: true });
	}

	function renderBars(bars, data) {
		bars.replaceChildren();
		const days = data.days.slice(-DAY_COUNT);
		for (const day of days) {
			const cell = document.createElement('span');
			cell.className = 'manj-uptime-day';
			cell.dataset.state = day.state;
			cell.title = day.fill;
			bars.appendChild(cell);
		}
		updateUptimeGridColumns(bars);
	}

	function renderFooter(sidebar, mountPoint, data) {
		let footer = mountPoint.querySelector('.manj-system-map-footer');
		if (!footer) {
			footer = document.createElement('div');
			footer.className = 'manj-system-map-footer';

			const map = document.createElement('div');
			map.className = 'manj-system-map';
			footer.appendChild(map);

			const uptime = document.createElement('section');
			uptime.className = 'manj-uptime-window';
			uptime.setAttribute('aria-label', 'GitHub Pages uptime from GitHub Status');

			const heading = document.createElement('div');
			heading.className = 'manj-uptime-window__title';
			heading.textContent = 'UPTIME WINDOW';
			uptime.appendChild(heading);

			const bars = document.createElement('div');
			bars.className = 'manj-uptime-bars';
			bars.setAttribute('role', 'img');
			bars.setAttribute(
				'aria-label',
				'GitHub Pages daily status for the past ' + DAY_COUNT + ' days',
			);
			uptime.appendChild(bars);

			const legend = document.createElement('div');
			legend.className = 'manj-uptime-legend';
			uptime.appendChild(legend);

			footer.appendChild(uptime);
			mountPoint.appendChild(footer);
			sidebar.classList.add('manj-uptime-loaded');
		}

		footer.querySelector('.manj-system-map').textContent = [
			'SYSTEM MAP',
			'manj.io       100%',
			'Cloudflare    ready',
			'Astro static  ok',
			'Pagefind      indexed',
			'GitHub Pages  ' + statusLabel(data.status),
		].join('\n');

		const recentDays = data.days.slice(-DAY_COUNT);
		renderBars(footer.querySelector('.manj-uptime-bars'), data);
		footer.querySelector('.manj-uptime-legend').textContent =
			DAY_COUNT + ' days       ' + formatPercent(percentFromDays(recentDays) || data.percent);
		bindResponsiveUptimeGrid(footer);
	}

	async function loadSnapshot() {
		const response = await fetch(SNAPSHOT_URL, { cache: 'no-cache' });
		if (!response.ok) throw new Error('snapshot ' + response.status);
		return response.json();
	}

	async function loadLive() {
		const response = await fetch(STATUS_HOME_URL, {
			headers: { 'User-Agent': 'manj.io-github-pages-uptime/1.0' },
		});
		if (!response.ok) throw new Error('live ' + response.status);
		return parseUptime(await response.text());
	}

	function mount() {
		const sidebar = document.querySelector('.right-sidebar');
		if (!sidebar) return;
		const mountPoint =
			sidebar.querySelector('.right-sidebar-panel') ?? sidebar;

		loadSnapshot()
			.then(function (data) {
				renderFooter(sidebar, mountPoint, data);
				return loadLive()
					.then(function (live) {
						renderFooter(sidebar, mountPoint, live);
					})
					.catch(function () {
						/* snapshot is enough */
					});
			})
			.catch(function () {
				return loadLive()
					.then(function (live) {
						renderFooter(sidebar, mountPoint, live);
					})
					.catch(function () {
						/* keep CSS fallback */
					});
			});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', mount);
	} else {
		mount();
	}
})();
