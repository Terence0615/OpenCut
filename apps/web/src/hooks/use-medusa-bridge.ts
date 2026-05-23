"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { getMediaTypeFromFile } from "@/media/media-utils";
import { AddMediaAssetCommand, BatchCommand, InsertElementCommand } from "@/commands";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { mediaTimeFromSeconds } from "@/wasm";
import {
	initMedusaBridge,
	IS_MEDUSA_EMBEDDED,
	notifyExportComplete,
	notifyProjectLoaded,
	notifyTimelineReady,
	onMedusaMessage,
	type MedusaVideoScene,
} from "@/medusa-bridge";

const SCENE_DURATION_SEC = 4;

async function urlToFile(url: string, name: string): Promise<File | null> {
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const blob = await res.blob();
		const type = blob.type || "application/octet-stream";
		return new File([blob], name, { type });
	} catch (e) {
		console.error("[medusa-bridge] fetch media failed", url, e);
		return null;
	}
}

function parseSceneStartSec(scene: MedusaVideoScene, index: number): number {
	if (scene.status && !scene.video_url && !scene.image_url) return index * SCENE_DURATION_SEC;
	return index * SCENE_DURATION_SEC;
}

export function useMedusaBridge({ projectId }: { projectId: string }) {
	const editor = useEditor();
	const { setTheme } = useTheme();

	useEffect(() => {
		if (!IS_MEDUSA_EMBEDDED) return;

		initMedusaBridge();

		const loadScenes = async ({ scenes }: { scenes: MedusaVideoScene[] }) => {
			const active = editor.project.getActiveOrNull();
			if (!active) return;

			const ordered = [...scenes].sort(
				(a, b) => (a.scene_number ?? 0) - (b.scene_number ?? 0),
			);

			for (let i = 0; i < ordered.length; i++) {
				const scene = ordered[i];
				const url = scene.video_url || scene.image_url;
				if (!url) continue;

				const file = await urlToFile(
					url,
					`scene-${scene.scene_number ?? i + 1}.${scene.video_url ? "mp4" : "png"}`,
				);
				if (!file) continue;

				const mediaType = getMediaTypeFromFile({ file });
				if (!mediaType || mediaType === "audio") continue;

				const processed = await processMediaAssets({ files: [file] });
				const asset = processed[0];
				if (!asset) continue;

				const startTime = mediaTimeFromSeconds({
					seconds: parseSceneStartSec(scene, i),
				});

				const duration =
					asset.duration != null
						? mediaTimeFromSeconds({ seconds: asset.duration })
						: mediaTimeFromSeconds({ seconds: SCENE_DURATION_SEC });

				const addMediaCmd = new AddMediaAssetCommand({
					projectId: active.metadata.id,
					asset,
				});
				const assetId = addMediaCmd.getAssetId();

				const element = buildElementFromMedia({
					mediaId: assetId,
					mediaType: asset.type,
					name: asset.name,
					duration,
					startTime,
				});

				const insertCmd = new InsertElementCommand({
					element,
					placement: { mode: "auto", trackType: "video" },
				});

				editor.command.execute({
					command: new BatchCommand([addMediaCmd, insertCmd]),
				});
			}
		};

		onMedusaMessage("medusa:load-scenes", loadScenes);
		onMedusaMessage("medusa:add-clip", ({ scene }) => {
			void loadScenes({ scenes: [scene] });
		});
		onMedusaMessage("medusa:theme-change", ({ theme }) => {
			setTheme(theme);
		});
		onMedusaMessage("medusa:export-request", async ({ format }) => {
			try {
				const result = await editor.project.export({
					options: {
						format: format === "webm" ? "webm" : "mp4",
						quality: "high",
					},
				});
				if (result.success && result.buffer) {
					const blob = new Blob([result.buffer], {
						type: format === "webm" ? "video/webm" : "video/mp4",
					});
					notifyExportComplete(URL.createObjectURL(blob));
				}
			} catch (e) {
				console.error("[medusa-bridge] export failed", e);
			}
		});

		notifyTimelineReady();
		notifyProjectLoaded(projectId);
	}, [editor, projectId, setTheme]);
}
