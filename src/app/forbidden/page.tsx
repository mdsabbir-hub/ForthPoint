import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto max-w-md px-4 py-20">
      <h1 className="text-xl font-semibold">You don’t have access to this area</h1>
      <p className="mt-2 text-muted">Your account is signed in but has no administrator role. Ask an administrator to grant one.</p>
      <Link href="/" className="mt-6 inline-block text-accent">Back to the public site</Link>
    </main>
  );
}
