import { NewPasswordForm } from "@/components/new-password-form";
import { updatePassword } from "../actions";

export default function RedefinirSenhaPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 pb-safe-bottom pt-safe-top">
      <NewPasswordForm action={updatePassword} />
    </main>
  );
}
