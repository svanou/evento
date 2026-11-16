import { ResetPassword } from "@/components/reset-password";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <ResetPassword
      url={process.env.NEXT_PUBLIC_SUPABASE_URL || ""}
      publishableKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""}
    />
  );
}
