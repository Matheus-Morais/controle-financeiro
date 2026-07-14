import { AuthForm } from "@/components/auth-form";
import { signIn } from "../actions";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 pb-safe-bottom pt-safe-top">
      <AuthForm mode="login" action={signIn} />
    </main>
  );
}
