import { createFileRoute } from "@tanstack/react-router";
import { StorageManagementPage } from "@/components/StorageManagementPage";

export const Route = createFileRoute("/_authenticated/clinica/armazenamento")({ component: ClinicStoragePage });

function ClinicStoragePage() {
  return <StorageManagementPage context="clinic" />;
}
