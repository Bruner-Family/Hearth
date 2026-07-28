import { describe, expect, it } from "vitest";

import {
  assertWithinSizeLimit,
  attachmentDisplayName,
  attachmentStoragePath,
  MAX_ATTACHMENT_BYTES,
  storageSafeName,
} from "@/lib/attachments";

describe("storageSafeName", () => {
  it("keeps an already-safe name intact", () => {
    expect(storageSafeName("manual-2019.pdf")).toBe("manual-2019.pdf");
  });

  it("collapses spaces and punctuation into single dashes", () => {
    expect(storageSafeName("Manual (2019) — LG.pdf")).toBe(
      "Manual-2019-LG.pdf",
    );
  });

  it("keeps only the base name so the key can't escape its prefix", () => {
    expect(storageSafeName("../../etc/passwd")).toBe("passwd");
  });

  it("drops leading dots rather than writing a hidden object", () => {
    expect(storageSafeName(".env")).toBe("env");
  });

  it("falls back to a stem when nothing survives sanitizing", () => {
    expect(storageSafeName("的.pdf")).toBe("file.pdf");
    expect(storageSafeName("!!!")).toBe("file");
  });

  it("truncates a long stem but preserves the extension", () => {
    const result = storageSafeName(`${"a".repeat(200)}.pdf`);
    expect(result).toBe(`${"a".repeat(80)}.pdf`);
  });
});

describe("attachmentStoragePath", () => {
  const path = () =>
    attachmentStoragePath("hh", "it", "Manual (2019) — LG.pdf");

  it("puts the household first, then the item, then a safe name", () => {
    expect(path()).toMatch(/^hh\/it\/\d+-[a-z0-9]+-Manual-2019-LG\.pdf$/);
  });

  it("does not repeat a key for the same file", () => {
    expect(path()).not.toBe(path());
  });
});

describe("attachmentDisplayName", () => {
  it("prefers the stored file name", () => {
    expect(
      attachmentDisplayName({
        file_name: "Manual (2019) — LG.pdf",
        storage_path: "h/i/1750000000000-Manual-2019-LG.pdf",
      }),
    ).toBe("Manual (2019) — LG.pdf");
  });

  it("derives a name from the path for rows predating file_name", () => {
    expect(
      attachmentDisplayName({
        file_name: null,
        storage_path: "h/i/1750000000000-receipt.pdf",
      }),
    ).toBe("receipt.pdf");
  });

  it("also strips the random suffix newer keys carry", () => {
    expect(
      attachmentDisplayName({
        file_name: null,
        storage_path: "h/i/1750000000000-k3f9zq-receipt.pdf",
      }),
    ).toBe("receipt.pdf");
  });

  it("falls back to a label when the path has no usable segment", () => {
    expect(
      attachmentDisplayName({ file_name: null, storage_path: "h/i/" }),
    ).toBe("Attachment");
  });
});

describe("assertWithinSizeLimit", () => {
  it("accepts a missing or in-limit size", () => {
    expect(() => assertWithinSizeLimit("a.pdf", undefined)).not.toThrow();
    expect(() =>
      assertWithinSizeLimit("a.pdf", MAX_ATTACHMENT_BYTES),
    ).not.toThrow();
  });

  it("rejects a file over the bucket limit, naming it", () => {
    expect(() =>
      assertWithinSizeLimit("big.pdf", MAX_ATTACHMENT_BYTES + 1),
    ).toThrow(/"big\.pdf" is larger than the 10 MB limit\./);
  });
});
