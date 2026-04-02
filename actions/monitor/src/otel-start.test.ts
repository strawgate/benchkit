import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { platformArch, downloadUrl } from "./otel-start.js";

// ── platformArch ────────────────────────────────────────────────────

describe("platformArch", () => {
  it("returns values for the current platform", () => {
    // We can't test all platforms from one machine, but we can verify
    // that the current platform is handled without throwing.
    const result = platformArch();
    assert.ok(["linux", "darwin", "windows"].includes(result.os));
    assert.ok(["amd64", "arm64"].includes(result.arch));
    assert.ok(["tar.gz", "zip"].includes(result.ext));
  });

  it("uses tar.gz for non-windows and zip for windows", () => {
    const result = platformArch();
    if (process.platform === "win32") {
      assert.equal(result.ext, "zip");
    } else {
      assert.equal(result.ext, "tar.gz");
    }
  });
});

// ── downloadUrl ─────────────────────────────────────────────────────

describe("downloadUrl", () => {
  it("builds correct URL for linux amd64", () => {
    const url = downloadUrl("0.102.0", "linux", "amd64", "tar.gz");
    assert.equal(
      url,
      "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.102.0/otelcol-contrib_0.102.0_linux_amd64.tar.gz",
    );
  });

  it("builds correct URL for darwin arm64", () => {
    const url = downloadUrl("0.102.0", "darwin", "arm64", "tar.gz");
    assert.equal(
      url,
      "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.102.0/otelcol-contrib_0.102.0_darwin_arm64.tar.gz",
    );
  });

  it("builds correct URL for windows", () => {
    const url = downloadUrl("0.102.0", "windows", "amd64", "zip");
    assert.equal(
      url,
      "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.102.0/otelcol-contrib_0.102.0_windows_amd64.zip",
    );
  });

  it("handles different versions", () => {
    const url = downloadUrl("0.110.0", "linux", "arm64", "tar.gz");
    assert.match(url, /v0\.110\.0/);
    assert.match(url, /otelcol-contrib_0\.110\.0_linux_arm64\.tar\.gz/);
  });
});
