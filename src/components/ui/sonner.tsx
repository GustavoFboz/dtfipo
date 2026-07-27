import { Toaster as Sonner } from "sonner";
import { CheckCircle2, AlertTriangle, Info, XCircle, Loader2 } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      icons={{
        success: <CheckCircle2 className="h-4 w-4 text-primary" />,
        error: <XCircle className="h-4 w-4 text-destructive" />,
        warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
        info: <Info className="h-4 w-4 text-primary" />,
        loading: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
      }}
      toastOptions={{
        unstyled: false,
        classNames: {
          // Fundo opaco com tokens do tema — garante contraste em light e dark.
          toast:
            "group toast pointer-events-auto flex items-start gap-3 w-full " +
            "rounded-2xl border border-border dark:border-white/[0.06] " +
            "!bg-background !text-foreground " +
            "shadow-[0_20px_60px_-15px_rgba(0,0,0,0.45)] " +
            "p-4",
          title: "text-sm font-medium leading-tight !text-foreground [&_b]:font-semibold [&_strong]:font-semibold",
          description: "text-xs leading-relaxed !text-foreground/80 mt-0.5 font-normal [&_b]:font-semibold [&_strong]:font-semibold",
          icon: "flex items-center justify-center shrink-0 mt-0.5",
          actionButton:
            "rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm shadow-primary/25 hover:bg-primary/90 transition",
          cancelButton:
            "rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 transition",
          closeButton:
            "!bg-transparent !border-0 !text-muted-foreground hover:!text-foreground",
          success: "[&_[data-icon]]:text-primary",
          error: "[&_[data-icon]]:text-destructive border-destructive/40",
          warning: "[&_[data-icon]]:text-amber-500 border-amber-500/40",
          info: "[&_[data-icon]]:text-primary",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
