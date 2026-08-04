import {
  readJsonBody,
  readUrlEncodedBody,
  RequestBodyError
} from "@/lib/request-body";

describe("bounded request body parsing", () => {
  it("parses a JSON body within the limit", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ ok: true })
    });

    await expect(readJsonBody(request, 64)).resolves.toEqual({ ok: true });
  });

  it("rejects a declared body larger than the limit before reading it", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-length": "1000" },
      body: "{}"
    });

    await expect(readJsonBody(request, 10)).rejects.toMatchObject({
      code: "body_too_large",
      status: 413
    });
  });

  it("rejects a streamed body that crosses the limit", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ value: "too large" })
    });

    await expect(readJsonBody(request, 8)).rejects.toBeInstanceOf(
      RequestBodyError
    );
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{"
    });

    await expect(readJsonBody(request)).rejects.toMatchObject({
      code: "invalid_json",
      status: 400
    });
  });

  it("accepts bounded URL-encoded forms only", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=test%40example.com"
    });

    const form = await readUrlEncodedBody(request);
    expect(form.get("email")).toBe("test@example.com");
  });
});
