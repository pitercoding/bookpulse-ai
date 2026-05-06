import { auth } from "@clerk/nextjs/server";

const Page = async () => {
  const { userId } = await auth();

  return (
    <main className="wrapper flex min-h-screen items-center pt-28">
      <section className="max-w-2xl space-y-4">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-black/60">
          AI reading companion
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {userId
            ? "You're signed in and ready to build your library."
            : "Turn every book into a conversation."}
        </h1>
        <p className="text-base leading-7 text-black/70 sm:text-lg">
          {userId
            ? "Your Clerk session is active. Use the profile icon in the navigation to manage your account."
            : "Create your first account from the navigation to test Clerk, then come back here and start exploring your reading workspace."}
        </p>
      </section>
    </main>
  );
};

export default Page;
