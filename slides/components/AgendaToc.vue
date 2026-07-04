<script setup lang="ts">
export type AgendaItem = {
	n: number
	title: string
	sub?: string
}

withDefaults(
	defineProps<{
		current?: number
		items: AgendaItem[]
	}>(),
	{
		current: 0,
	},
)
</script>

<template>
	<div class="agenda-toc">
		<div
			v-for="item in items"
			:key="item.n"
			class="item"
			:class="{ active: item.n === current }"
		>
			<div class="num">{{ item.n }}</div>
			<div class="body">
				<div class="title">{{ item.title }}</div>
				<div v-if="item.sub" class="sub">{{ item.sub }}</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.agenda-toc {
	display: flex;
	flex-direction: column;
	gap: 1.25rem;
	max-width: 42rem;
	margin: 0 auto;
	text-align: left;
}

.item {
	display: flex;
	gap: 1rem;
	align-items: flex-start;
	opacity: 0.5;
	transition: opacity 0.15s ease;
}

.item.active {
	opacity: 1;
}

.num {
	flex-shrink: 0;
	width: 2rem;
	height: 2rem;
	border-radius: 9999px;
	border: 1px solid currentColor;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 0.875rem;
	font-variant-numeric: tabular-nums;
}

.item.active .num {
	background: currentColor;
	color: var(--slidev-theme-background, #fff);
}

.title {
	font-size: 1.125rem;
	font-weight: 600;
	line-height: 1.35;
}

.sub {
	margin-top: 0.25rem;
	font-size: 0.875rem;
	opacity: 0.75;
	line-height: 1.4;
}
</style>
