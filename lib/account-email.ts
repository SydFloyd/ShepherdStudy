import { AccountTokenPurpose } from "@prisma/client";

import {
  createAccountToken,
  revokeAccountToken
} from "@/lib/account-tokens";
import { sendTransactionalEmail } from "@/lib/postmark";

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character] ?? character
  );
}

function publicOrigin() {
  const configured = (
    process.env.ACCOUNT_EMAIL_BASE_URL ?? process.env.NEXTAUTH_URL
  )?.trim();
  if (!configured) {
    throw new Error("ACCOUNT_EMAIL_BASE_URL or NEXTAUTH_URL is required.");
  }

  const url = new URL(configured);
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) ||
    url.username ||
    url.password
  ) {
    throw new Error("Account email base URL must be HTTPS (or local HTTP).");
  }
  return url.origin;
}

function accountLink(pathname: string, token: string) {
  const link = new URL(pathname, publicOrigin());
  link.searchParams.set("token", token);
  return link.toString();
}

async function sendAccountTokenEmail(input: {
  user: { id: string; email: string; name: string | null };
  purpose: AccountTokenPurpose;
  pathname: string;
  subject: string;
  intro: string;
  actionLabel: string;
  expiryLabel: string;
  tag: string;
}) {
  const issued = await createAccountToken(input.user.id, input.purpose);
  const link = accountLink(input.pathname, issued.token);
  const greeting = input.user.name?.trim()
    ? `Hello ${input.user.name.trim()},`
    : "Hello,";
  const textBody = [
    greeting,
    "",
    input.intro,
    "",
    link,
    "",
    `This link expires in ${input.expiryLabel}. If you did not request this, you can ignore this email.`
  ].join("\n");
  const htmlBody = `<!doctype html><html><body style="font-family:Georgia,serif;color:#1f2a1f;line-height:1.5"><p>${escapeHtml(greeting)}</p><p>${escapeHtml(input.intro)}</p><p><a href="${escapeHtml(link)}" style="display:inline-block;background:#395b3f;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none">${escapeHtml(input.actionLabel)}</a></p><p style="color:#5c665c;font-size:14px">This link expires in ${escapeHtml(input.expiryLabel)}. If you did not request this, you can ignore this email.</p></body></html>`;

  try {
    return await sendTransactionalEmail({
      to: input.user.email,
      subject: input.subject,
      textBody,
      htmlBody,
      tag: input.tag
    });
  } catch (error) {
    await revokeAccountToken(issued.id).catch(() => undefined);
    throw error;
  }
}

export function sendVerificationEmail(user: {
  id: string;
  email: string;
  name: string | null;
}) {
  return sendAccountTokenEmail({
    user,
    purpose: AccountTokenPurpose.VERIFY_EMAIL,
    pathname: "/api/auth/verify-email",
    subject: "Verify your ShepherdStudy email",
    intro: "Confirm this email address to activate your ShepherdStudy account.",
    actionLabel: "Verify email",
    expiryLabel: "24 hours",
    tag: "email-verification"
  });
}

export function sendPasswordResetEmail(user: {
  id: string;
  email: string;
  name: string | null;
}) {
  return sendAccountTokenEmail({
    user,
    purpose: AccountTokenPurpose.RESET_PASSWORD,
    pathname: "/reset-password",
    subject: "Reset your ShepherdStudy password",
    intro: "Use this secure link to choose a new ShepherdStudy password.",
    actionLabel: "Reset password",
    expiryLabel: "1 hour",
    tag: "password-reset"
  });
}

export const __testables = { escapeHtml, publicOrigin, accountLink };
