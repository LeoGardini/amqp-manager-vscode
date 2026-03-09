import type { BindingDetails } from "../../extension/types/rabbitmq";
import type {
	BindingFormData,
	ExchangeEditorState,
	ExchangeSettingsFormData,
	PublishFormData,
	QueueEditorState,
	QueueSettingsFormData,
	ResourceEditorHostMessage,
	ResourceEditorState,
	ResourceEditorViewMessage,
} from "./resourceEditorProtocol";

declare function acquireVsCodeApi(): {
	postMessage(message: ResourceEditorViewMessage): void;
	setState(state: unknown): void;
	getState(): unknown;
};

interface PersistedState {
	busy: boolean;
	busyAction: string;
	editingBindingId?: string;
	bindingDraft?: BindingFormData;
	resourceState?: ResourceEditorState;
	status?: {
		kind: "success" | "error" | "info";
		message: string;
	};
}

const vscode = acquireVsCodeApi();
const root = document.querySelector<HTMLDivElement>("#app");

let busy = false;
let busyAction = "";
let editingBindingId: string | undefined;
let bindingDraft: BindingFormData | undefined;
let resourceState: ResourceEditorState | undefined;
let status: PersistedState["status"];

restoreState();
render();
window.addEventListener("message", handleMessage);
window.addEventListener("DOMContentLoaded", () => {
	post({ type: "ready" });
});

function handleMessage(event: MessageEvent<ResourceEditorHostMessage>): void {
	const message = event.data;
	switch (message.type) {
		case "busy":
			busy = message.payload.busy;
			busyAction = message.payload.action;
			persistState();
			render();
			break;
		case "operation-result":
			status = message.payload;
			if (message.payload.kind !== "error") {
				editingBindingId = undefined;
				bindingDraft = undefined;
			}
			persistState();
			render();
			break;
		case "state":
			resourceState = message.payload;
			persistState();
			render();
			break;
	}
}

function post(message: ResourceEditorViewMessage): void {
	vscode.postMessage(message);
}

function restoreState(): void {
	const persisted = vscode.getState() as PersistedState | undefined;
	busy = persisted?.busy ?? false;
	busyAction = persisted?.busyAction ?? "";
	editingBindingId = persisted?.editingBindingId;
	bindingDraft = persisted?.bindingDraft;
	resourceState = persisted?.resourceState;
	status = persisted?.status;
}

function persistState(): void {
	vscode.setState({
		busy,
		busyAction,
		editingBindingId,
		bindingDraft,
		resourceState,
		status,
	} satisfies PersistedState);
}

function render(): void {
	if (!root) {
		return;
	}

	if (!resourceState) {
		root.innerHTML = `<main class="shell"><header class="hero"><div class="hero-left"><h1>Loading…</h1><p class="subtitle">Fetching resource data from the broker.</p></div></header></main>${styleMarkup}`;
		return;
	}

	const bindingForm = bindingDraft ?? structuredClone(resourceState.binding);
	const displayName =
		resourceState.kind === "queue"
			? resourceState.queue.name
			: resourceState.exchange.name || "(default)";
	const kindLabel = resourceState.kind === "queue" ? "Queue" : "Exchange";
	const metaParts = [
		escapeHtml(resourceState.connectionName),
		`/${escapeHtml(resourceState.vhost)}`,
		escapeHtml(formatTimestamp(resourceState.lastLoadedAt)),
	];
	if (resourceState.autoRefreshSeconds > 0) {
		metaParts.push(`auto refresh ${resourceState.autoRefreshSeconds}s`);
	}

	root.innerHTML = `
		<main class="shell">
			<header class="hero">
				<div class="hero-left">
					<span class="kind-badge">${escapeHtml(kindLabel)}</span>
					<h1>${escapeHtml(displayName)}</h1>
					<p class="subtitle">${metaParts.join(" · ")}</p>
				</div>
				<div class="hero-actions">
					<button type="button" class="secondary" data-action="refresh" ${busy ? "disabled" : ""}>Refresh</button>
				</div>
			</header>

			${status ? `<div class="status-bar ${status.kind}">${escapeHtml(status.message)}</div>` : ""}
			${busy ? `<div class="status-bar info">${escapeHtml(busyAction || "Working")}…</div>` : ""}
			${resourceState.notices.length > 0 ? `<section class="section notices"><ul>${resourceState.notices.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul></section>` : ""}

			<section class="section">
				<h2>Overview</h2>
				<div class="overview-grid">
					${resourceState.overviewItems
						.map(
							(item) =>
								`<div class="overview-item"><span class="ov-label">${escapeHtml(item.label)}</span><span class="ov-value">${escapeHtml(item.value)}</span></div>`,
						)
						.join("")}
				</div>
			</section>

			<section class="section">
				<h2>Settings</h2>
				<form id="settings-form" class="form-grid">
					<div class="field ${resourceState.kind === "queue" ? "span-2" : "span-1"}">
						<label for="resource-name">Name</label>
						<input id="resource-name" name="name" value="${escapeAttribute(displayName === "(default)" ? "" : displayName)}" disabled />
					</div>
					${renderSettingsFields(resourceState)}
					<div class="field span-2">
						<button type="submit" class="primary" ${busy || !resourceState.canEditSettings ? "disabled" : ""}>Save settings</button>
					</div>
				</form>
			</section>

			<section class="section">
				<div class="section-header">
					<h2>Bindings</h2>
					${editingBindingId ? `<button type="button" class="ghost" data-action="cancel-binding">Cancel edit</button>` : ""}
				</div>
				${renderBindingsTable(resourceState)}
				<form id="binding-form" class="form-grid">
					${renderBindingFields(resourceState, bindingForm)}
					<div class="field span-2">
						<button type="submit" class="primary" ${busy || !resourceState.canManageBindings ? "disabled" : ""}>${editingBindingId ? "Replace binding" : "Create binding"}</button>
					</div>
				</form>
			</section>

			<section class="section">
				<h2>Publish message</h2>
				<p class="helper">${escapeHtml(
					resourceState.kind === "queue"
						? `Messages are published via the default exchange using the fixed routing key "${resourceState.publish.routingKey}".`
						: `Publish directly to exchange "${resourceState.exchange.name || "(default)"}" with the routing key you choose.`,
				)}</p>
				<form id="publish-form" class="form-grid">
					${renderPublishFields(resourceState)}
					<div class="field span-2">
						<button type="submit" class="primary" ${busy || !resourceState.canPublish ? "disabled" : ""}>Publish message</button>
					</div>
				</form>
			</section>
		</main>
		${styleMarkup}
	`;

	wireEvents(resourceState);
}

function wireEvents(state: ResourceEditorState): void {
	const refreshButton = document.querySelector<HTMLButtonElement>(
		'[data-action="refresh"]',
	);
	refreshButton?.addEventListener("click", () => {
		status = undefined;
		post({ type: "refresh" });
	});

	const cancelBindingButton = document.querySelector<HTMLButtonElement>(
		'[data-action="cancel-binding"]',
	);
	cancelBindingButton?.addEventListener("click", () => {
		editingBindingId = undefined;
		bindingDraft = undefined;
		persistState();
		render();
	});

	for (const button of Array.from(
		document.querySelectorAll<HTMLButtonElement>("[data-binding-edit]"),
	)) {
		button.addEventListener("click", () => {
			const bindingId = button.dataset.bindingEdit;
			const binding = state.bindings.find((item) => item.id === bindingId);
			if (!binding) {
				return;
			}

			editingBindingId = binding.id;
			bindingDraft = toBindingDraft(state, binding);
			persistState();
			render();
		});
	}

	for (const button of Array.from(
		document.querySelectorAll<HTMLButtonElement>("[data-binding-delete]"),
	)) {
		button.addEventListener("click", () => {
			const bindingId = button.dataset.bindingDelete;
			const binding = state.bindings.find((item) => item.id === bindingId);
			if (!binding) {
				return;
			}

			post({ type: "delete-binding", payload: { binding } });
		});
	}

	const settingsForm =
		document.querySelector<HTMLFormElement>("#settings-form");
	settingsForm?.addEventListener("submit", (event) => {
		event.preventDefault();
		status = undefined;
		post({
			type: "save-settings",
			payload:
				state.kind === "queue"
					? readQueueSettings(state)
					: readExchangeSettings(state),
		});
	});

	const bindingForm = document.querySelector<HTMLFormElement>("#binding-form");
	bindingForm?.addEventListener("submit", (event) => {
		event.preventDefault();
		status = undefined;
		const binding = readBindingForm(state);
		post({
			type: "save-binding",
			payload: {
				original: state.bindings.find((item) => item.id === editingBindingId),
				binding,
			},
		});
	});

	const publishForm = document.querySelector<HTMLFormElement>("#publish-form");
	publishForm?.addEventListener("submit", (event) => {
		event.preventDefault();
		status = undefined;
		post({
			type: "publish-message",
			payload: readPublishForm(state),
		});
	});

	if (state.kind === "exchange") {
		const destTypeSelect = document.querySelector<HTMLSelectElement>(
			"#binding-destination-type",
		);
		destTypeSelect?.addEventListener("change", () => {
			bindingDraft = {
				source: state.exchange.name,
				destination: "",
				destinationType: readSelectValue(
					"binding-destination-type",
				) as BindingFormData["destinationType"],
				routingKey: readInputValue("binding-routing-key"),
				argumentsText: readInputValue("binding-arguments"),
			};
			persistState();
			render();
		});
	}
}

function renderSettingsFields(state: ResourceEditorState): string {
	if (state.kind === "queue") {
		return `
			${checkboxField("queue-durable", "durable", "Durable", state.settings.durable)}
			${checkboxField("queue-auto-delete", "autoDelete", "Auto delete", state.settings.autoDelete)}
			${checkboxField("queue-exclusive", "exclusive", "Exclusive", state.settings.exclusive)}
			${selectFromList("queue-dlx", "deadLetterExchange", "Dead letter exchange", state.settings.deadLetterExchange, state.exchangeNames, "(none)")}
			${textField("queue-dlrk", "deadLetterRoutingKey", "Dead letter routing key", state.settings.deadLetterRoutingKey)}
			${textField("queue-ttl", "messageTtl", "Message TTL (ms)", state.settings.messageTtl)}
			${textAreaField("queue-arguments", "argumentsText", "Extra arguments (JSON)", state.settings.argumentsText, true)}
		`;
	}

	return `
		${selectField("exchange-type", "type", "Type", state.settings.type, [
			"direct",
			"topic",
			"fanout",
			"headers",
			"x-delayed-message",
		])}
		${checkboxField("exchange-durable", "durable", "Durable", state.settings.durable)}
		${checkboxField("exchange-auto-delete", "autoDelete", "Auto delete", state.settings.autoDelete)}
		${checkboxField("exchange-internal", "internal", "Internal", state.settings.internal)}
		${selectFromList("exchange-ae", "alternateExchange", "Alternate exchange", state.settings.alternateExchange, state.exchangeNames, "(none)")}
		${textAreaField("exchange-arguments", "argumentsText", "Extra arguments (JSON)", state.settings.argumentsText, true)}
	`;
}

function renderBindingsTable(state: ResourceEditorState): string {
	if (state.bindings.length === 0) {
		return `<p class="empty">No bindings found for this ${state.kind}.</p>`;
	}

	if (state.kind === "queue") {
		return `
			<table>
				<thead>
					<tr><th>From exchange</th><th>Routing key</th><th>Arguments</th><th>Actions</th></tr>
				</thead>
				<tbody>
					${state.bindings.map((binding) => renderQueueBindingRow(binding)).join("")}
				</tbody>
			</table>
		`;
	}

	return `
		<table>
			<thead>
				<tr><th>Destination</th><th>Type</th><th>Routing key</th><th>Arguments</th><th>Actions</th></tr>
			</thead>
			<tbody>
				${state.bindings.map((binding) => renderExchangeBindingRow(binding)).join("")}
			</tbody>
		</table>
	`;
}

function renderQueueBindingRow(binding: BindingDetails): string {
	const implicit = !binding.source.trim();
	return `
		<tr>
			<td>${escapeHtml(binding.source || "(default exchange)")}</td>
			<td>${escapeHtml(binding.routingKey || "(empty)")}</td>
			<td><pre>${escapeHtml(formatJson(binding.arguments))}</pre></td>
			<td>
				<div class="row-actions">
					<button type="button" class="ghost" data-binding-edit="${escapeAttribute(binding.id)}" ${implicit || busy ? "disabled" : ""}>Edit</button>
					<button type="button" class="ghost danger" data-binding-delete="${escapeAttribute(binding.id)}" ${implicit || busy ? "disabled" : ""}>Delete</button>
				</div>
			</td>
		</tr>
	`;
}

function renderExchangeBindingRow(binding: BindingDetails): string {
	return `
		<tr>
			<td>${escapeHtml(binding.destination)}</td>
			<td>${escapeHtml(binding.destinationType)}</td>
			<td>${escapeHtml(binding.routingKey || "(empty)")}</td>
			<td><pre>${escapeHtml(formatJson(binding.arguments))}</pre></td>
			<td>
				<div class="row-actions">
					<button type="button" class="ghost" data-binding-edit="${escapeAttribute(binding.id)}" ${busy ? "disabled" : ""}>Edit</button>
					<button type="button" class="ghost danger" data-binding-delete="${escapeAttribute(binding.id)}" ${busy ? "disabled" : ""}>Delete</button>
				</div>
			</td>
		</tr>
	`;
}

function renderBindingFields(
	state: ResourceEditorState,
	binding: BindingFormData,
): string {
	if (state.kind === "queue") {
		return `
			${selectFromList("binding-source", "source", "Source exchange", binding.source, state.exchangeNames, "— select exchange —")}
			${textField("binding-routing-key", "routingKey", "Routing key", binding.routingKey)}
			${textAreaField("binding-arguments", "argumentsText", "Arguments (JSON)", binding.argumentsText, true)}
		`;
	}

	const destOptions =
		binding.destinationType === "exchange"
			? state.exchangeNames
			: state.queueNames;

	return `
		${selectFromList("binding-destination", "destination", "Destination", binding.destination, destOptions, "— select destination —")}
		${selectField("binding-destination-type", "destinationType", "Destination type", binding.destinationType, ["queue", "exchange"])}
		${textField("binding-routing-key", "routingKey", "Routing key", binding.routingKey)}
		${textAreaField("binding-arguments", "argumentsText", "Arguments (JSON)", binding.argumentsText, true)}
	`;
}

function renderPublishFields(state: ResourceEditorState): string {
	return `
		${textField(
			"publish-routing-key",
			"routingKey",
			"Routing key",
			state.publish.routingKey,
			state.kind === "queue",
		)}
		${textAreaField("publish-properties", "propertiesText", "Properties (JSON)", state.publish.propertiesText, true)}
		${textAreaField("publish-payload", "payload", "Payload", state.publish.payload, false)}
	`;
}

function readQueueSettings(state: QueueEditorState): QueueSettingsFormData {
	return {
		name: state.settings.name,
		durable: readCheckbox("queue-durable"),
		autoDelete: readCheckbox("queue-auto-delete"),
		exclusive: readCheckbox("queue-exclusive"),
		deadLetterExchange: readInputValue("queue-dlx"),
		deadLetterRoutingKey: readInputValue("queue-dlrk"),
		messageTtl: readInputValue("queue-ttl"),
		argumentsText: readInputValue("queue-arguments"),
	};
}

function readExchangeSettings(
	state: ExchangeEditorState,
): ExchangeSettingsFormData {
	return {
		name: state.settings.name,
		type: readSelectValue("exchange-type"),
		durable: readCheckbox("exchange-durable"),
		autoDelete: readCheckbox("exchange-auto-delete"),
		internal: readCheckbox("exchange-internal"),
		alternateExchange: readInputValue("exchange-ae"),
		argumentsText: readInputValue("exchange-arguments"),
	};
}

function readBindingForm(state: ResourceEditorState): BindingFormData {
	if (state.kind === "queue") {
		return {
			source: readInputValue("binding-source"),
			destination: state.queue.name,
			destinationType: "queue",
			routingKey: readInputValue("binding-routing-key"),
			argumentsText: readInputValue("binding-arguments"),
		};
	}

	return {
		source: state.exchange.name,
		destination: readInputValue("binding-destination"),
		destinationType: readSelectValue(
			"binding-destination-type",
		) as BindingFormData["destinationType"],
		routingKey: readInputValue("binding-routing-key"),
		argumentsText: readInputValue("binding-arguments"),
	};
}

function readPublishForm(state: ResourceEditorState): PublishFormData {
	return {
		exchange: state.publish.exchange,
		routingKey: readInputValue("publish-routing-key"),
		payload: readInputValue("publish-payload"),
		propertiesText: readInputValue("publish-properties"),
	};
}

function toBindingDraft(
	state: ResourceEditorState,
	binding: BindingDetails,
): BindingFormData {
	return {
		source: state.kind === "queue" ? binding.source : state.exchange.name,
		destination:
			state.kind === "queue" ? state.queue.name : binding.destination,
		destinationType: state.kind === "queue" ? "queue" : binding.destinationType,
		routingKey: binding.routingKey,
		argumentsText: formatJson(binding.arguments),
	};
}

function readInputValue(id: string): string {
	const element = document.getElementById(id) as
		| HTMLInputElement
		| HTMLTextAreaElement
		| HTMLSelectElement
		| null;
	return element?.value ?? "";
}

function readSelectValue(id: string): string {
	const element = document.getElementById(id) as HTMLSelectElement | null;
	return element?.value ?? "";
}

function readCheckbox(id: string): boolean {
	const element = document.getElementById(id) as HTMLInputElement | null;
	return Boolean(element?.checked);
}

function textField(
	id: string,
	name: string,
	label: string,
	value: string,
	disabled = false,
): string {
	return `<div class="field"><label for="${id}">${escapeHtml(label)}</label><input id="${id}" name="${escapeAttribute(name)}" value="${escapeAttribute(value)}" ${disabled ? "disabled" : ""} /></div>`;
}

function textAreaField(
	id: string,
	name: string,
	label: string,
	value: string,
	code = false,
): string {
	return `<div class="field span-2"><label for="${id}">${escapeHtml(label)}</label><textarea id="${id}" name="${escapeAttribute(name)}" class="${code ? "code" : ""}">${escapeHtml(value)}</textarea></div>`;
}

function checkboxField(
	id: string,
	name: string,
	label: string,
	checked: boolean,
): string {
	return `<label class="checkbox" for="${id}"><input id="${id}" name="${escapeAttribute(name)}" type="checkbox" ${checked ? "checked" : ""} /> <span>${escapeHtml(label)}</span></label>`;
}

function selectField(
	id: string,
	name: string,
	label: string,
	selected: string,
	options: string[],
): string {
	return `<div class="field"><label for="${id}">${escapeHtml(label)}</label><select id="${id}" name="${escapeAttribute(name)}">${options
		.map(
			(option) =>
				`<option value="${escapeAttribute(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`,
		)
		.join("")}</select></div>`;
}

function selectFromList(
	id: string,
	name: string,
	label: string,
	value: string,
	options: string[],
	placeholder?: string,
	disabled = false,
): string {
	const allOptions = [...options];
	if (value && !allOptions.includes(value)) {
		allOptions.unshift(value);
	}
	const emptyOption = placeholder
		? `<option value="">${escapeHtml(placeholder)}</option>`
		: "";
	const renderedOptions = allOptions
		.map(
			(opt) =>
				`<option value="${escapeAttribute(opt)}" ${opt === value ? "selected" : ""}>${escapeHtml(opt)}</option>`,
		)
		.join("");
	return `<div class="field"><label for="${id}">${escapeHtml(label)}</label><select id="${id}" name="${escapeAttribute(name)}" ${disabled ? "disabled" : ""}>${emptyOption}${renderedOptions}</select></div>`;
}

function formatTimestamp(value: string): string {
	return new Date(value).toLocaleString();
}

function formatJson(value: Record<string, unknown>): string {
	return JSON.stringify(value, null, 2);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
	return escapeHtml(value);
}

const styleMarkup = `<style>
	:root { color-scheme: light dark; }
	*, *::before, *::after { box-sizing: border-box; }
	body {
		margin: 0;
		background: var(--vscode-editor-background);
		color: var(--vscode-editor-foreground);
		font-family: var(--vscode-font-family);
		font-size: var(--vscode-font-size, 13px);
		line-height: 1.5;
	}
	button, input, select, textarea { font: inherit; }
	/* Shell */
	.shell {
		max-width: 960px;
		margin: 0 auto;
		padding: 28px 32px 48px;
	}
	/* Hero */
	.hero {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		padding-bottom: 20px;
		border-bottom: 1px solid var(--vscode-panel-border);
		margin-bottom: 4px;
	}
	.hero-left { display: flex; flex-direction: column; gap: 4px; }
	.kind-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 3px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		background: color-mix(in srgb, var(--vscode-focusBorder) 16%, transparent);
		color: var(--vscode-focusBorder);
		margin-bottom: 6px;
		width: fit-content;
	}
	h1 {
		margin: 0 0 4px;
		font-size: 22px;
		font-weight: 600;
		line-height: 1.2;
	}
	h2 {
		margin: 0 0 14px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--vscode-descriptionForeground);
	}
	.subtitle { margin: 0; font-size: 12px; color: var(--vscode-descriptionForeground); }
	.helper { margin: 0 0 14px; font-size: 12px; color: var(--vscode-descriptionForeground); }
	.empty { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 0 0 12px; }
	/* Hero actions */
	.hero-actions { display: flex; gap: 8px; padding-top: 2px; flex-shrink: 0; }
	/* Sections */
	.section {
		padding: 22px 0;
		border-bottom: 1px solid var(--vscode-panel-border);
	}
	.section:last-child { border-bottom: none; }
	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 14px;
	}
	.section-header h2 { margin: 0; }
	/* Status bar */
	.status-bar {
		padding: 8px 14px;
		border-radius: 4px;
		font-size: 12px;
		margin-top: 14px;
		border: 1px solid transparent;
	}
	.status-bar.success {
		background: color-mix(in srgb, var(--vscode-testing-iconPassed) 10%, transparent);
		border-color: var(--vscode-testing-iconPassed);
		color: var(--vscode-testing-iconPassed);
	}
	.status-bar.error {
		background: color-mix(in srgb, var(--vscode-errorForeground) 10%, transparent);
		border-color: var(--vscode-errorForeground);
		color: var(--vscode-errorForeground);
	}
	.status-bar.info {
		background: color-mix(in srgb, var(--vscode-focusBorder) 10%, transparent);
		border-color: var(--vscode-focusBorder);
	}
	/* Overview */
	.overview-grid { display: flex; flex-wrap: wrap; gap: 8px; }
	.overview-item {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 10px 14px;
		border: 1px solid var(--vscode-panel-border);
		border-radius: 6px;
		min-width: 88px;
	}
	.ov-label {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--vscode-descriptionForeground);
	}
	.ov-value { font-size: 15px; font-weight: 600; }
	/* Forms */
	.form-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px 16px;
		align-items: start;
	}
	.field { display: flex; flex-direction: column; gap: 4px; }
	.field > label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--vscode-descriptionForeground);
	}
	.span-2 { grid-column: span 2; }
	input, select, textarea {
		width: 100%;
		padding: 6px 10px;
		background: var(--vscode-input-background);
		color: var(--vscode-input-foreground);
		border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
		border-radius: 4px;
	}
	input:focus, select:focus, textarea:focus {
		outline: 1px solid var(--vscode-focusBorder);
		outline-offset: -1px;
		border-color: var(--vscode-focusBorder);
	}
	input:disabled, select:disabled, textarea:disabled { opacity: 0.55; cursor: not-allowed; }
	textarea { min-height: 96px; resize: vertical; }
	textarea.code, pre {
		font-family: var(--vscode-editor-font-family);
		font-size: 12px;
	}
	pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
	/* Checkbox — treated as a labeled field */
	.checkbox {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		user-select: none;
		padding-top: 22px;
	}
	.checkbox input[type="checkbox"] {
		width: 14px;
		height: 14px;
		padding: 0;
		accent-color: var(--vscode-focusBorder);
		flex-shrink: 0;
		cursor: pointer;
	}
	/* Buttons */
	button {
		cursor: pointer;
		padding: 6px 12px;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 500;
		border: 1px solid transparent;
		white-space: nowrap;
	}
	button.primary {
		background: var(--vscode-button-background);
		color: var(--vscode-button-foreground);
	}
	button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
	button.secondary {
		background: var(--vscode-button-secondaryBackground);
		color: var(--vscode-button-secondaryForeground);
	}
	button.secondary:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
	button.ghost {
		background: transparent;
		color: var(--vscode-editor-foreground);
		border-color: var(--vscode-panel-border);
		padding: 4px 8px;
		font-size: 11px;
	}
	button.ghost:hover:not(:disabled) { background: var(--vscode-list-hoverBackground); }
	button.danger { color: var(--vscode-errorForeground); border-color: currentColor; }
	button:disabled { opacity: 0.45; cursor: not-allowed; }
	/* Table */
	table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
	th {
		text-align: left;
		padding: 6px 10px;
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--vscode-descriptionForeground);
		border-bottom: 1px solid var(--vscode-panel-border);
	}
	td {
		text-align: left;
		vertical-align: top;
		padding: 8px 10px;
		border-bottom: 1px solid var(--vscode-panel-border);
	}
	tr:last-child td { border-bottom: none; }
	.row-actions { display: flex; gap: 4px; }
	/* Notices */
	.notices ul { margin: 0; padding-left: 18px; font-size: 12px; color: var(--vscode-descriptionForeground); }
	.notices li + li { margin-top: 4px; }
	@media (max-width: 700px) {
		.shell { padding: 16px; }
		.hero { flex-direction: column; }
		.form-grid { grid-template-columns: 1fr; }
		.span-2 { grid-column: span 1; }
		.checkbox { padding-top: 0; }
	}
</style>`;
