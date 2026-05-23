/**
 * Medusa ↔ OpenCut postMessage bridge (iframe embed).
 */

export const IS_MEDUSA_EMBEDDED =
	typeof window !== "undefined" && window.parent !== window;

function postToParent(type: string, payload?: Record<string, unknown>) {
	if (!IS_MEDUSA_EMBEDDED) return;
	window.parent.postMessage({ type, payload }, "*");
}

export function notifyTimelineReady() {
	postToParent("timeline:ready");
}

export function notifyProjectLoaded(projectId: string) {
	postToParent("timeline:project-loaded", { projectId });
}

export function notifySceneSelected(sceneId: string | null) {
	postToParent("timeline:scene-selected", { sceneId });
}

export function notifyExportComplete(url: string) {
	postToParent("timeline:export-complete", { url });
}

export function notifyTimelineChanged() {
	postToParent("timeline:changed");
}

export type MedusaVideoScene = {
	id: string;
	scene_number?: number;
	narration?: string | null;
	video_url?: string | null;
	image_url?: string | null;
	status?: string;
};

type MedusaMessageHandler = {
	"medusa:load-scenes": (payload: { scenes: MedusaVideoScene[] }) => void;
	"medusa:add-clip": (payload: { scene: MedusaVideoScene }) => void;
	"medusa:theme-change": (payload: { theme: "light" | "dark" }) => void;
	"medusa:export-request": (payload: { format?: string }) => void;
};

const handlers: Partial<MedusaMessageHandler> = {};

export function onMedusaMessage<K extends keyof MedusaMessageHandler>(
	type: K,
	handler: MedusaMessageHandler[K],
) {
	handlers[type] = handler;
}

export function initMedusaBridge() {
	if (!IS_MEDUSA_EMBEDDED) return;

	const embed = new URLSearchParams(window.location.search).get("embed") === "true";
	if (embed) {
		document.documentElement.dataset.embedded = "true";
	}

	window.addEventListener("message", (event: MessageEvent) => {
		const { type, payload } = (event.data ?? {}) as {
			type?: string;
			payload?: unknown;
		};
		if (!type || typeof type !== "string") return;
		const handler = handlers[type as keyof MedusaMessageHandler] as
			| ((p: never) => void)
			| undefined;
		if (handler) handler(payload as never);
	});
}

export function isMedusaEmbedMode(): boolean {
	if (typeof window === "undefined") return false;
	return (
		IS_MEDUSA_EMBEDDED &&
		new URLSearchParams(window.location.search).get("embed") === "true"
	);
}
