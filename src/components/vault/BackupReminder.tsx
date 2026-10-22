import { useNavigate } from "@tanstack/react-router";
import { HardDriveDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useVault } from "@/lib/vault/vault-context";

export function BackupReminder() {
  const { status, backupReminder, dismissBackupReminder } = useVault();
  const navigate = useNavigate();
  return (
    <AlertDialog
      open={status === "unlocked" && backupReminder}
      onOpenChange={(open) => {
        if (!open) dismissBackupReminder();
      }}
    >
      <AlertDialogContent className="max-w-sm rounded-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Create a fresh backup?</AlertDialogTitle>
          <AlertDialogDescription>
            Your new entries are saved in Vault, but older backups don’t include them. Save a new
            encrypted file or copy to your other device.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">Later</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              onClick={() => {
                dismissBackupReminder();
                void navigate({ to: "/backup" });
              }}
            >
              <HardDriveDownload className="mr-1.5 h-4 w-4" />
              Back up now
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
