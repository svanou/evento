export type Mail = { to: string; subject: string; html: string; text: string };
export interface MailTransport {
  send(mail: Mail, idempotencyKey: string): Promise<{ id: string }>;
}
export function mailReadiness() {
  return {
    enabled: ["test", "production"].includes(
      process.env.EMAIL_MODE || "disabled",
    ),
    keyConfigured: !!process.env.RESEND_API_KEY,
    senderConfigured: !!process.env.EMAIL_FROM,
  };
}
export function requireRecipient(email: string) {
  const readiness = mailReadiness();
  if (!readiness.enabled) throw new Error("Envoi des emails désactivé");
  if (!readiness.keyConfigured || !readiness.senderConfigured)
    throw new Error("Configurer RESEND_API_KEY et EMAIL_FROM avant l’envoi");
  if (
    process.env.EMAIL_MODE === "test" &&
    !(process.env.EMAIL_TEST_ALLOWLIST || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .includes(email.toLowerCase())
  )
    throw new Error("Destinataire absent de la liste de test autorisée");
}
export class ResendTransport implements MailTransport {
  async send(mail: Mail, idempotencyKey: string) {
    requireRecipient(mail.to);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });
    if (!response.ok)
      throw new Error(
        `Le fournisseur email a refusé la requête (HTTP ${response.status}).`,
      );
    const result = (await response.json()) as { id?: string };
    if (!result.id)
      throw new Error(
        "Réponse email ambiguë : vérifier le fournisseur avant de réessayer",
      );
    return { id: result.id };
  }
}
