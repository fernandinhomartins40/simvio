import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/** Painel lateral para edição (foco preso, Esc fecha, acessível por teclado). */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-petroleo/30" />
        <Dialog.Content
          aria-describedby={description ? undefined : ""}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-5 overflow-y-auto bg-white p-6 shadow-xl sm:rounded-l-3xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-2xl font-extrabold tracking-tight">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-petroleo-soft">{description}</Dialog.Description>}
            </div>
            <Dialog.Close aria-label="Fechar" className="rounded-lg p-2 hover:bg-mineral"><X className="size-5" /></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
