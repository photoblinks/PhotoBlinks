import { Separator } from "@/components/ui/separator";

export function AuthDivider() {
  return (
    <div className="my-6 flex items-center gap-3">
      <Separator className="flex-1" />
      <span className="text-xs text-muted-foreground uppercase">or</span>
      <Separator className="flex-1" />
    </div>
  );
}
