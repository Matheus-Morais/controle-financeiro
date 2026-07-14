import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { requestPasswordReset } from "../actions";

export default function EsqueciSenhaPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 pb-safe-bottom pt-safe-top">
      <ForgotPasswordForm action={requestPasswordReset} />
    </main>
  );
}
