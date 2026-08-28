import { describe, expect, it } from "vitest";
import { getDownloadInfo, getStreamKind, looksLikeHls, sortStreamsForWeb } from "../src/player";

describe("stream capabilities", () => {
  it("offers a browser download for a direct media file", () => {
    const stream = {
      url: "https://media.example/files/video.mkv",
      behaviorHints: { filename: "Barangay: Finale.mkv", videoSize: 1_073_741_824 }
    };

    expect(getStreamKind(stream)).toBe("direct");
    expect(getDownloadInfo(stream)).toEqual({
      url: "https://media.example/files/video.mkv",
      filename: "Barangay_ Finale.mkv",
      size: 1_073_741_824
    });
  });

  it("does not present playlists or insecure remote URLs as downloads", () => {
    expect(looksLikeHls({ url: "https://media.example/master.m3u8" })).toBe(true);
    expect(getDownloadInfo({ url: "https://media.example/master.m3u8" })).toBeNull();
    expect(getDownloadInfo({ url: "http://media.example/video.mp4" })).toBeNull();
  });

  it("rejects sources that need private browser headers", () => {
    expect(
      getDownloadInfo({
        url: "https://media.example/video.mp4",
        behaviorHints: { proxyHeaders: { request: { Authorization: "private" } } }
      })
    ).toBeNull();
  });

  it("prefers adaptive and smaller browser-friendly streams over a large MKV", () => {
    const ranked = sortStreamsForWeb([
      { name: "Large MKV", url: "https://media.example/video.mkv", behaviorHints: { videoSize: 2_147_483_648 } },
      { name: "MP4", url: "https://media.example/video.mp4", behaviorHints: { videoSize: 734_003_200 } },
      { name: "Adaptive", url: "https://media.example/master.m3u8" }
    ]);

    expect(ranked.map((stream) => stream.name)).toEqual(["Adaptive", "MP4", "Large MKV"]);
  });
});
