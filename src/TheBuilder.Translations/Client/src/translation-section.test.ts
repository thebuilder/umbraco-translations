import { describe, expect, it } from "vitest";
import { editorUrlFor } from "./translation-section.js";

const section = "https://example.test/umbraco/section/translation";

describe("editorUrlFor", () => {
  it("points the bare section at the editor's view", () => {
    expect(editorUrlFor(section, section)).toBe(`${section}/view/overview`);
  });

  it("treats a trailing slash as the bare section", () => {
    expect(editorUrlFor(`${section}/`, section)).toBe(`${section}/view/overview`);
  });

  it("keeps the query and fragment the editor was opened with", () => {
    expect(editorUrlFor(`${section}?locale=da-DK&namespace=account#top`, section)).toBe(
      `${section}/view/overview?locale=da-DK&namespace=account#top`
    );
  });

  it("leaves an address that already names a view alone", () => {
    expect(editorUrlFor(`${section}/view/overview?locale=da-DK`, section)).toBeUndefined();
  });

  it("leaves other sections alone", () => {
    expect(editorUrlFor("https://example.test/umbraco/section/content", section)).toBeUndefined();
    expect(
      editorUrlFor("https://example.test/umbraco/section/translations", section)
    ).toBeUndefined();
  });
});
