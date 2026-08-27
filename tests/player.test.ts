import { describe, expect, it } from "vitest";
import { getDownloadInfo, getStreamKind, looksLikeHls } from "../src/player";

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
});
