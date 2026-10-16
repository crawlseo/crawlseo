"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, LogOut, Trash2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  deleteAccountAction,
  disconnectGoogleAction,
  signOutAction,
  type DeleteAccountState,
} from "@/app/(dashboard)/account/actions";

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:bg-bg focus:outline-none";

/** The submit button of a form, busy while its action runs. */
function SubmitButton({
  children,
  pendingLabel,
  variant,
  disabled = false,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "default" | "outline" | "destructive";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending || disabled}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {pending ? pendingLabel : children}
    </Button>
  );
}

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <SubmitButton variant="outline" pendingLabel="Signing out">
        <LogOut className="size-4" aria-hidden />
        Sign out
      </SubmitButton>
    </form>
  );
}

export function DisconnectGoogleDialog({ disabled = false }: { disabled?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" disabled={disabled} />}>
        <Unplug className="size-4" aria-hidden />
        Disconnect Google
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disconnect Google?</DialogTitle>
          <DialogDescription>
            crawlseo asks Google to revoke its access, removes the stored Google tokens and signs
            you out on every device. Search Console sync stops until you sign in again and grant
            access.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Your sites and their data stay. If Google cannot be reached, the tokens are still removed
          here and you will be told so.
        </p>

        <form action={disconnectGoogleAction} className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <CancelButton />
          <SubmitButton variant="destructive" pendingLabel="Disconnecting">
            Disconnect
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAccountDialog({
  email,
  registrationClosed,
}: {
  email: string;
  registrationClosed: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [state, formAction] = useActionState<DeleteAccountState, FormData>(deleteAccountAction, {
    error: null,
  });
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <Dialog onOpenChange={(open) => !open && setTyped("")}>
      <DialogTrigger render={<Button variant="destructive" />}>
        <Trash2 className="size-4" aria-hidden />
        Delete account
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This deletes your account, every site and all its data (Search Console history, crawls,
            vitals, alerts, saved keywords) and your API keys. Google access is revoked first. This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {registrationClosed && (
          <p className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-text-strong">
            Registration is closed on this instance, so this Google account cannot sign up here
            again.
          </p>
        )}

        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="confirm-email" className="mb-1 block text-xs font-medium text-muted-foreground">
              Type <span className="font-data text-text-strong">{email}</span> to confirm
            </label>
            <input
              id="confirm-email"
              name="confirmEmail"
              type="email"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          {state.error && (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <CancelButton />
            <SubmitButton variant="destructive" pendingLabel="Deleting" disabled={!matches}>
              Delete account
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Closes the dialog; disabled while the form's action runs. */
function CancelButton() {
  const { pending } = useFormStatus();
  return (
    <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>
      Cancel
    </DialogClose>
  );
}
