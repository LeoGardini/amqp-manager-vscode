import type {
	BindingDetails,
	ExchangeDetails,
	QueueDetails,
} from "../../extension/types/rabbitmq";

export type ResourceEditorKind = "queue" | "exchange";

export interface OverviewItem {
	label: string;
	value: string;
}

export interface QueueSettingsFormData {
	name: string;
	durable: boolean;
	autoDelete: boolean;
	exclusive: boolean;
	deadLetterExchange: string;
	deadLetterRoutingKey: string;
	messageTtl: string;
	argumentsText: string;
}

export interface ExchangeSettingsFormData {
	name: string;
	type: string;
	durable: boolean;
	autoDelete: boolean;
	internal: boolean;
	alternateExchange: string;
	argumentsText: string;
}

export interface BindingFormData {
	source: string;
	destination: string;
	destinationType: "queue" | "exchange";
	routingKey: string;
	argumentsText: string;
}

export interface PublishFormData {
	exchange: string;
	routingKey: string;
	payload: string;
	propertiesText: string;
}

interface ResourceEditorBaseState {
	kind: ResourceEditorKind;
	title: string;
	connectionId: string;
	connectionName: string;
	vhost: string;
	lastLoadedAt: string;
	autoRefreshSeconds: number;
	notices: string[];
	canEditSettings: boolean;
	canManageBindings: boolean;
	canPublish: boolean;
	overviewItems: OverviewItem[];
	exchangeNames: string[];
	queueNames: string[];
}

export interface QueueEditorState extends ResourceEditorBaseState {
	kind: "queue";
	queue: QueueDetails;
	settings: QueueSettingsFormData;
	bindings: BindingDetails[];
	binding: BindingFormData;
	publish: PublishFormData;
}

export interface ExchangeEditorState extends ResourceEditorBaseState {
	kind: "exchange";
	exchange: ExchangeDetails;
	settings: ExchangeSettingsFormData;
	bindings: BindingDetails[];
	binding: BindingFormData;
	publish: PublishFormData;
	isDefaultExchange: boolean;
}

export type ResourceEditorState = QueueEditorState | ExchangeEditorState;

export type ResourceEditorViewMessage =
	| { type: "ready" }
	| { type: "refresh" }
	| {
			type: "save-settings";
			payload: QueueSettingsFormData | ExchangeSettingsFormData;
	  }
	| {
			type: "save-binding";
			payload: {
				original?: BindingDetails;
				binding: BindingFormData;
			};
	  }
	| {
			type: "delete-binding";
			payload: {
				binding: BindingDetails;
			};
	  }
	| {
			type: "publish-message";
			payload: PublishFormData;
	  };

export type ResourceEditorHostMessage =
	| {
			type: "state";
			payload: ResourceEditorState;
	  }
	| {
			type: "busy";
			payload: {
				busy: boolean;
				action: string;
			};
	  }
	| {
			type: "operation-result";
			payload: {
				kind: "success" | "error" | "info";
				message: string;
			};
	  };
