import type { StreamItem, SubtitleItem } from "./types";

type HlsConstructor = typeof import("hls.js").default;
type HlsInstance = InstanceType<HlsConstructor>;

export type StreamKind = "direct" | "external" | "torrent" | "youtube" | "unsupported";

export function getStreamKind(stream: StreamItem): StreamKind {
  if (stream.url && /^https?:\/\//i.test(stream.url)) return "direct";
  if (stream.externalUrl) return "external";
  if (stream.infoHash) return "torrent";
  if (stream.ytId) return "youtube";
  return "unsupported";
}

export function streamLabel(stream: StreamItem, index: number): string {
  return stream.name?.trim() || stream.title?.trim() || `Source ${index + 1}`;
}

export function streamDetail(stream: StreamItem): string {
  const parts = [stream.title, stream.description, stream.behaviorHints?.filename]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim());
  return [...new Set(parts)].join(" · ");
}

function looksLikeHls(stream: StreamItem): boolean {
  const source = `${stream.url ?? ""} ${stream.behaviorHints?.filename ?? ""}`.toLowerCase();
  return source.includes(".m3u8") || source.includes("application/vnd.apple.mpegurl");
}

function safeTrackUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export class MediaPlayer {
  private hls: HlsInstance | null = null;
  private cleanup: Array<() => void> = [];

  destroy(): void {
    this.hls?.destroy();
    this.hls = null;
    for (const dispose of this.cleanup.splice(0)) dispose();
  }

  async attach(
    video: HTMLVideoElement,
    stream: StreamItem,
    subtitles: SubtitleItem[],
    startAt: number,
    onProgress: (currentTime: number, duration: number) => void,
    onError: (message: string) => void
  ): Promise<void> {
    this.destroy();
    const sourceUrl = stream.url;
    if (!sourceUrl) throw new Error("This source does not include a direct web stream.");
    if (stream.behaviorHints?.notWebReady) {
      throw new Error("This source is marked as unavailable for web playback.");
    }
    if (stream.behaviorHints?.proxyHeaders?.request) {
      throw new Error("This source requires private request headers that browsers cannot send safely.");
    }

    video.replaceChildren();
    video.removeAttribute("src");
    video.load();

    for (const [index, subtitle] of subtitles.entries()) {
      const url = safeTrackUrl(subtitle.url);
      if (!url) continue;
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.src = url;
      track.srclang = subtitle.lang || "und";
      track.label = subtitle.lang?.toUpperCase() || `Subtitle ${index + 1}`;
      track.default = index === 0;
      video.append(track);
    }

    const restorePosition = (): void => {
      if (startAt > 2 && Number.isFinite(video.duration) && startAt < video.duration - 5) {
        video.currentTime = startAt;
      }
    };
    const recordProgress = (): void => onProgress(video.currentTime, video.duration || 0);
    const reportError = (): void =>
      onError("The video could not load. Try another source; the host may block browser playback.");

    video.addEventListener("loadedmetadata", restorePosition, { once: true });
    video.addEventListener("timeupdate", recordProgress);
    video.addEventListener("error", reportError);
    this.cleanup.push(() => video.removeEventListener("timeupdate", recordProgress));
    this.cleanup.push(() => video.removeEventListener("error", reportError));

    if (looksLikeHls(stream)) {
      const { default: Hls } = await import("hls.js");
      if (!Hls.isSupported()) {
        video.src = sourceUrl;
        try {
          await video.play();
        } catch {
          // Mobile browsers may require a second explicit tap.
        }
        return;
      }
      this.hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90
      });
      this.hls.attachMedia(video);
      this.hls.on(Hls.Events.MEDIA_ATTACHED, () => this.hls?.loadSource(sourceUrl));
      this.hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          this.hls?.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          this.hls?.recoverMediaError();
          return;
        }
        onError("This HLS source stopped unexpectedly. Try another source.");
        this.destroy();
      });
    } else {
      video.src = sourceUrl;
    }

    try {
      await video.play();
    } catch {
      // Mobile browsers may require a second explicit tap on the native play control.
    }
  }
}
