import Link from "next/link";
import { BadgeCheck, Camera, ImagePlus, MailCheck, UserPlus } from "lucide-react";

const STEPS = [
  { icon: UserPlus, title: "Create your account", text: "Add your studio details." },
  { icon: MailCheck, title: "Confirm your email", text: "Use the link we send you." },
  { icon: BadgeCheck, title: "Get approved", text: "Our team reviews every new photographer." },
  { icon: ImagePlus, title: "Go live", text: "Submit shoots and get discovered." },
];

const TAB_BASE = "rounded-full px-4 py-1.5 font-medium";
const TAB_ACTIVE = `${TAB_BASE} bg-background shadow-sm`;
const TAB_IDLE = `${TAB_BASE} text-muted-foreground`;

/** Shared frame for the photographer login and signup pages — deliberately
 * unlike the customer sign-in/sign-up pages so the two audiences never get
 * mixed up. */
export function PhotographerAuthShell({
  active,
  children,
}: {
  active: "login" | "signup";
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-gradient-to-b from-neutral-950 to-neutral-800 p-12 text-white lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-pb-brand">
              <Camera className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-heading text-lg font-semibold">PhotoBlinks</p>
              <p className="text-xs tracking-widest text-white/60 uppercase">Photographer Portal</p>
            </div>
          </div>
          <h2 className="mt-16 max-w-sm font-heading text-3xl leading-tight font-semibold">
            Show your pre-wedding work to couples planning their shoot.
          </h2>
        </div>

        <ol className="space-y-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex items-start gap-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                <step.icon className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  {i + 1}. {step.title}
                </p>
                <p className="text-sm text-white/60">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </aside>

      <main className="flex flex-col bg-background">
        <header className="flex items-center justify-between gap-4 p-4 sm:px-8">
          <div className="flex rounded-full bg-muted p-1 text-sm">
            <Link
              href="/sign-in/photographer"
              aria-current={active === "login" ? "page" : undefined}
              className={active === "login" ? TAB_ACTIVE : TAB_IDLE}
            >
              Log in
            </Link>
            <Link
              href="/sign-in/photographer/signup"
              aria-current={active === "signup" ? "page" : undefined}
              className={active === "signup" ? TAB_ACTIVE : TAB_IDLE}
            >
              Sign up
            </Link>
          </div>
          <Link href="/sign-in" className="text-sm text-muted-foreground hover:text-foreground">
            Not a photographer? Customer sign in
          </Link>
        </header>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
