import { AuthForm } from "@/components/auth-form";
import { signUp } from "../actions";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 pb-safe-bottom pt-safe-top">
      <AuthForm mode="signup" action={signUp} />
    </main>
  );
}
