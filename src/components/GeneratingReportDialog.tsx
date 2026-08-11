
import React from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface GeneratingReportDialogProps {
  open: boolean;
}

export function GeneratingReportDialog({ open }: GeneratingReportDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-[425px] p-12 flex flex-col items-center justify-center border-none shadow-2xl bg-white dark:bg-slate-900 rounded-[2rem]">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
            <Loader2 className="h-16 w-16 text-primary animate-spin stroke-[1.5px] relative z-10" />
          </div>
          
          <div className="space-y-2 text-center">
            <h3 className="text-2xl font-light text-slate-900 dark:text-slate-100 tracking-tight">
              Seu relatório está sendo gerado
            </h3>
            <p className="text-slate-400 font-normal text-sm">
              Aguarde enquanto preparamos seu PDF...
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
