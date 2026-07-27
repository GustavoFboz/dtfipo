import { Hammer } from "lucide-react";

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function FinanceiroSectionPlaceholder({ eyebrow, title, description, icon: Icon }: Props) {
  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/15 text-[11px] font-medium text-primary/80">
          <Icon className="h-3 w-3" />
          {eyebrow}
        </div>
        <h1 className="text-4xl md:text-5xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.03em] leading-[1.05]">
          {title}
        </h1>
        <p className="text-sm md:text-base font-light text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">
          {description}
        </p>
      </header>

      <div className="bg-white dark:bg-slate-900 p-8 md:p-10 rounded-[2rem] border border-slate-100 dark:border-slate-800 flex items-center gap-6">
        <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-500/20 shrink-0">
          <Hammer className="h-5 w-5 stroke-[1.2px]" />
        </div>
        <div className="space-y-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Em construção</div>
          <div className="text-xs font-light text-slate-500 dark:text-slate-400">
            A estrutura de banco, serviços e hooks já está preparada — a interface chegará em breve.
          </div>
        </div>
      </div>
    </div>
  );
}
