import { describe, expect, it } from "vitest";
import { ApiError, conflictOf, toApiError, unwrap } from "./errors.js";

const result = <T>(status: number, body: unknown, data?: T) =>
  Promise.resolve({
    data,
    error: status >= 400 ? body : undefined,
    response: new Response(null, { status }),
  });

/** Resolves with the ApiError a failing request produces, and fails loudly if it succeeds. */
const failure = (status: number, body: unknown): Promise<ApiError> =>
  unwrap(result(status, body)).then(() => {
    throw new Error(`Expected status ${status} to be thrown`);
  }, toApiError);

describe("unwrap", () => {
  it("returns the payload on success", async () => {
    await expect(unwrap(result(200, undefined, { id: "1" }))).resolves.toEqual({ id: "1" });
  });

  it("preserves the status so a conflict is distinguishable from a validation failure", async () => {
    const conflict = await failure(409, { code: "version_conflict" });
    const invalid = await failure(400, "bad value");

    expect(conflict.isConflict).toBe(true);
    expect(conflict.isValidation).toBe(false);
    expect(invalid.isValidation).toBe(true);
    expect(invalid.isConflict).toBe(false);
  });

  it("reads the message from a bare string body", async () => {
    // ASP.NET's BadRequest(string) serialises to a JSON string, not an object.
    const error = await failure(400, "Page size must be one of 50, 100, 200.");

    expect(error.message).toBe("Page size must be one of 50, 100, 200.");
  });

  it("reads the message from an object body", async () => {
    const error = await failure(409, { code: "version_conflict", message: "Changed elsewhere" });

    expect(error.message).toBe("Changed elsewhere");
    expect(error.code).toBe("version_conflict");
  });

  it("always produces a message, even when the body carries none", async () => {
    const error = await failure(403, {});

    expect(error.isForbidden).toBe(true);
    expect(error.message).toContain("403");
  });

  /*
   * An unhandled server exception puts its whole stack trace in ProblemDetails' `detail`, and this
   * message goes straight into a notification a couple of lines tall. A synchronization that hit a
   * rate limit reported four thousand characters of middleware frames with the one sentence
   * explaining it scrolled off the top.
   */
  it("keeps a message to the part somebody wrote for a person to read", async () => {
    const trace = [
      "An unhandled exception occurred.",
      "   at Umbraco.Cms.Web.Common.Middleware.ProtectRecycleBin(HttpContext context)",
      "   at Microsoft.AspNetCore.Builder.UseMiddlewareExtensions.MoveNext()",
    ].join("\n");
    const error = await failure(500, { detail: trace });

    expect(error.message).toBe("An unhandled exception occurred.");
    // Still all there for anything that wants it -- this trims what is shown, not what is known.
    expect((error.body as { detail: string }).detail).toBe(trace);
  });

  it("cuts a single line that runs on rather than letting it fill the screen", async () => {
    const error = await failure(500, "x".repeat(400));

    expect(error.message).toHaveLength(300);
    expect(error.message.endsWith("\u2026")).toBe(true);
  });

  it("leaves a message written to be read exactly as it is", async () => {
    const reported =
      "https://www.sst.dk/api/sync/translations/da answered 429 (Too Many Requests). " +
      "The endpoint is rate limiting this site. Wait before synchronizing again.";
    const error = await failure(502, reported);

    expect(error.message).toBe(reported);
  });
});

describe("conflictOf", () => {
  it("exposes the value that actually landed so a conflict needs no refetch", () => {
    const error = new ApiError(409, "Changed elsewhere", "version_conflict", {
      code: "version_conflict",
      message: "Changed elsewhere",
      currentVersion: 7,
      currentValue: "Din kurv er tom",
      updatedBy: "editor@example.test",
    });

    expect(conflictOf(error)).toMatchObject({ currentVersion: 7, currentValue: "Din kurv er tom" });
  });

  it("ignores errors that are not conflicts", () => {
    expect(
      conflictOf(new ApiError(400, "Invalid", undefined, { code: "invalid" }))
    ).toBeUndefined();
    expect(conflictOf(new Error("boom"))).toBeUndefined();
  });
});

describe("toApiError", () => {
  it("wraps a network failure as a status-less ApiError rather than throwing", () => {
    const error = toApiError(new TypeError("Failed to fetch"));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toBe("Failed to fetch");
  });

  it("passes an ApiError through unchanged", () => {
    const original = new ApiError(409, "Conflict");

    expect(toApiError(original)).toBe(original);
  });
});
