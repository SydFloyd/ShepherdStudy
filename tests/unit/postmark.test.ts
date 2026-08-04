import {
  PostmarkConfigurationError,
  sendTransactionalEmail
} from "@/lib/postmark";

function configure() {
  vi.stubEnv("POSTMARK_API_KEY", "server-token");
  vi.stubEnv("POSTMARK_FROM_EMAIL", "mail@example.com");
  vi.stubEnv("POSTMARK_FROM_NAME", "ShepherdStudy");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Postmark transactional email", () => {
  it("sends through the outbound stream without exposing secrets in the body", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ErrorCode: 0, Message: "OK", MessageID: "message-1" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendTransactionalEmail({
        to: "person@example.com",
        subject: "Subject",
        textBody: "Text",
        htmlBody: "<p>Text</p>",
        tag: "verification"
      })
    ).resolves.toEqual({ messageId: "message-1" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.postmarkapp.com/email");
    expect((init.headers as Record<string, string>)["X-Postmark-Server-Token"]).toBe(
      "server-token"
    );
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      From: "ShepherdStudy <mail@example.com>",
      To: "person@example.com",
      MessageStream: "outbound"
    });
    expect(String(init.body)).not.toContain("server-token");
  });

  it("fails before delivery when a verified sender is not configured", async () => {
    vi.stubEnv("POSTMARK_API_KEY", "server-token");
    vi.stubEnv("POSTMARK_FROM_EMAIL", "");
    vi.stubEnv("CONTACT_FROM_EMAIL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendTransactionalEmail({
        to: "person@example.com",
        subject: "Subject",
        textBody: "Text",
        htmlBody: "<p>Text</p>",
        tag: "verification"
      })
    ).rejects.toBeInstanceOf(PostmarkConfigurationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects Postmark API errors", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ErrorCode: 300, Message: "Invalid" }), {
          status: 422,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    await expect(
      sendTransactionalEmail({
        to: "person@example.com",
        subject: "Subject",
        textBody: "Text",
        htmlBody: "<p>Text</p>",
        tag: "verification"
      })
    ).rejects.toMatchObject({
      status: 422,
      errorCode: 300
    });
  });
});
