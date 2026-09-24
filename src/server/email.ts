import { Resend } from "resend";

let resend: Resend | null = null;

export function getResendClient(): Resend {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured.");
    }
    resend = new Resend(apiKey);
  }
  return resend;
}

export function getSenderEmail(): string {
  const sender = process.env.RESEND_SENDER_EMAIL;
  if (!sender) {
    throw new Error("RESEND_SENDER_EMAIL is not configured.");
  }
  return sender;
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const resendClient = getResendClient();
  const sender = getSenderEmail();

  const result = await resendClient.emails.send({
    from: `Waka Man <${sender}>`,
    to,
    subject,
    html,
  });

  if (result.error) {
    throw new Error(`Failed to send email: ${result.error.message}`);
  }
}
