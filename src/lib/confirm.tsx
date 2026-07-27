import { useSyncExternalStore, useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// ============================================================================
// Global confirm() / prompt() replacements — mantêm identidade visual do sistema.
// Uso:
//   const ok = await confirm({ title: "Excluir?", description: "..." });
//   const name = await promptDialog({ title: "Novo nome", placeholder: "..." });
// ============================================================================

export type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

export type PromptOptions = {
  title?: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  required?: boolean;
};

type ConfirmRequest = {
  kind: "confirm";
  id: number;
  options: ConfirmOptions;
  resolve: (v: boolean) => void;
};
type PromptRequest = {
  kind: "prompt";
  id: number;
  options: PromptOptions;
  resolve: (v: string | null) => void;
};
type Request = ConfirmRequest | PromptRequest;

let currentQueue: Request[] = [];
const listeners = new Set<() => void>();
let seq = 1;

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => currentQueue;

export function confirm(options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    currentQueue = [...currentQueue, { kind: "confirm", id: seq++, options, resolve }];
    emit();
  });
}

export function promptDialog(options: PromptOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    currentQueue = [...currentQueue, { kind: "prompt", id: seq++, options, resolve }];
    emit();
  });
}

function resolveTop(value: boolean | string | null) {
  const [top, ...rest] = currentQueue;
  if (!top) return;
  currentQueue = rest;
  emit();
  (top.resolve as (v: any) => void)(value);
}

export function ConfirmHost() {
  const queue = useSyncExternalStore(subscribe, getSnapshot, () => currentQueue);
  const top = queue[0];

  if (!top) return null;
  if (top.kind === "confirm") return <ConfirmView key={top.id} req={top} />;
  return <PromptView key={top.id} req={top} />;
}

function ConfirmView({ req }: { req: ConfirmRequest }) {
  const {
    title = "Confirmar ação",
    description,
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    destructive = false,
  } = req.options;
  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) resolveTop(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => resolveTop(false)}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => resolveTop(true)}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PromptView({ req }: { req: PromptRequest }) {
  const {
    title = "Informe um valor",
    description,
    placeholder,
    defaultValue = "",
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    required = false,
  } = req.options;
  const [value, setValue] = useState(defaultValue);
  useEffect(() => { setValue(defaultValue); }, [defaultValue]);
  const submit = () => {
    const v = value.trim();
    if (required && !v) return;
    resolveTop(v);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) resolveTop(null); }}>
      <DialogContent
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Input
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => resolveTop(null)}>{cancelText}</Button>
          <Button onClick={submit} disabled={required && !value.trim()}>{confirmText}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
