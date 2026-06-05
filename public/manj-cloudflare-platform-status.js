(function () {
	const SNAPSHOT_URL = '/cloudflare-platform-uptime.json';
	const CLOUDFLARE_STATUS_URL = '/cloudflare-status.json';
	const DAY_COUNT = 30;

	function formatPercent(percent) {
		if (!percent) return '—';
		return percent.includes('%') ? percent : percent + '%';
	}

	function statusLabel(status) {
		switch (status) {
			case 'operational':
			case 'none':
				return 'operational';
			case 'under_maintenance':
				return 'maintenance';
			case 'degraded_performance':
				return 'degraded';
			case 'minor':
				return 'minor outage';
			case 'critical':
				return 'critical outage';
			case 'partial_outage':
				return 'partial outage';
			case 'major':
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

	function renderFooter(sidebar, mountPoint, data, cloudflareStatus) {
		let footer = mountPoint.querySelector('.manj-system-map-footer');
		if (!footer) {
			footer = document.createElement('div');
			footer.className = 'manj-system-map-footer';

			const map = document.createElement('div');
			map.className = 'manj-system-map';
			footer.appendChild(map);

			const uptime = document.createElement('section');
			uptime.className = 'manj-uptime-window';
			uptime.setAttribute('aria-label', 'Cloudflare Pages and Workers uptime from Cloudflare Status');

			const heading = document.createElement('div');
			heading.className = 'manj-uptime-window__title';
			heading.textContent = 'UPTIME WINDOW';
			uptime.appendChild(heading);

			const bars = document.createElement('div');
			bars.className = 'manj-uptime-bars';
			bars.setAttribute('role', 'img');
			bars.setAttribute(
				'aria-label',
				'Cloudflare Pages and Workers daily status for the past ' + DAY_COUNT + ' days',
			);
			uptime.appendChild(bars);

			const legend = document.createElement('div');
			legend.className = 'manj-uptime-legend';
			uptime.appendChild(legend);

			footer.appendChild(uptime);
			mountPoint.appendChild(footer);
			sidebar.classList.add('manj-uptime-loaded');
		}

		const recentDays = data.days.slice(-DAY_COUNT);
		const recentPercent = formatPercent(percentFromDays(recentDays) || data.percent);
		footer.querySelector('.manj-system-map').textContent = [
			'SYSTEM MAP',
			'manj.io       ' + recentPercent,
			'Cloudflare    ' + statusLabel(cloudflareStatus.status),
			'Astro static  ok',
			'Pages         ' + statusLabel(data.pagesStatus || data.status),
			'Workers       ' + statusLabel(data.workersStatus || data.status),
			'SQLite FTS5   indexed',
		].join('\n');

		renderBars(footer.querySelector('.manj-uptime-bars'), data);
		footer.querySelector('.manj-uptime-legend').textContent =
			'Pages/Workers  ' +
			statusLabel(data.status) +
			'       ' +
			DAY_COUNT +
			' days       ' +
			recentPercent;
		bindResponsiveUptimeGrid(footer);
	}

	async function loadSnapshot() {
		const response = await fetch(SNAPSHOT_URL, { cache: 'no-cache' });
		if (!response.ok) throw new Error('snapshot ' + response.status);
		return response.json();
	}

	async function loadCloudflareStatus() {
		const response = await fetch(CLOUDFLARE_STATUS_URL, { cache: 'no-cache' });
		if (!response.ok) throw new Error('cloudflare status ' + response.status);
		return response.json();
	}

	function mount() {
		const sidebar = document.querySelector('.right-sidebar');
		if (!sidebar) return;
		const mountPoint =
			sidebar.querySelector('.right-sidebar-panel') ?? sidebar;

		Promise.all([
			loadSnapshot(),
			loadCloudflareStatus().catch(function () {
				return { status: 'unknown' };
			}),
		])
			.then(function ([data, cloudflareStatus]) {
				renderFooter(sidebar, mountPoint, data, cloudflareStatus);
			})
			.catch(function () {
				/* keep CSS fallback */
			});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', mount);
	} else {
		mount();
	}
})();
