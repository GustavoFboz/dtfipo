import { createFileRoute } from "@tanstack/react-router";
import { StorageManagementPage } from "@/components/StorageManagementPage";

export const Route = createFileRoute("/_authenticated/armazenamento")({ component: StoragePage });

function StoragePage() {
  return <StorageManagementPage context="laboratory" />;
}
