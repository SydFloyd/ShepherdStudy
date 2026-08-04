const POSTMARK_EMAIL_ENDPOINT = "https://api.postmarkapp.com/email";
const POSTMARK_TIMEOUT_MS = 10_000;

type PostmarkResponse = {
  ErrorCode?: unknown;
  Message?: unknown;
  MessageID?: unknown;
};

export class PostmarkConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostmarkConfigurationError";
  }
}

export class PostmarkDeliveryError extends Error {
  readonly status: number;
  readonly errorCode?: number;

  constructor(message: string, status: number, errorCode?: number) {
    super(message);
    this.name = "PostmarkDeliveryError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

function requiredConfiguration() {
  const apiKey = process.env.POSTMARK_API_KEY?.trim();
  const fromEmail = (
    process.env.POSTMARK_FROM_EMAIL ?? process.env.CONTACT_FROM_EMAIL
  )?.trim();
  const fromName = process.env.POSTMARK_FROM_NAME?.trim() || "ShepherdStudy";
  const messageStream =
    process.env.POSTMARK_MESSAGE_STREAM?.trim() || "outbound";

  if (!apiKey) {
    throw new PostmarkConfigurationError("POSTMARK_API_KEY is required.");
  }
  if (!fromEmail || !/^\S+@\S+\.\S+$/.test(fromEmail)) {
    throw new PostmarkConfigurationError(
      "POSTMARK_FROM_EMAIL must be a verified Postmark sender address."
    );
  }
  if (/\r|\n/.test(fromName) || /\r|\n/.test(messageStream)) {
    throw new PostmarkConfigurationError("Invalid Postmark configuration.");
  }

  return { apiKey, fromEmail, fromName, messageStream };
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  tag: string;
}) {
  const config = requiredConfiguration();
  const response = await fetch(POSTMARK_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": config.apiKey
    },
    body: JSON.stringify({
      From: `${config.fromName} <${config.fromEmail}>`,
      To: input.to,
      Subject: input.subject,
      TextBody: input.textBody,
      HtmlBody: input.htmlBody,
      Tag: input.tag,
      MessageStream: config.messageStream
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(POSTMARK_TIMEOUT_MS)
  });

  let result: PostmarkResponse | null = null;
  try {
    result = (await response.json()) as PostmarkResponse;
  } catch {
    // The status code still provides a safe, useful failure below.
  }

  const errorCode =
    typeof result?.ErrorCode === "number" ? result.ErrorCode : undefined;
  if (!response.ok || errorCode !== 0) {
    throw new PostmarkDeliveryError(
      "Postmark rejected the transactional email.",
      response.status,
      errorCode
    );
  }

  return {
    messageId:
      typeof result?.MessageID === "string" ? result.MessageID : undefined
  };
}

export const __testables = {
  POSTMARK_EMAIL_ENDPOINT,
  requiredConfiguration
};
