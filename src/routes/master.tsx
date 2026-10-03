import { createFileRoute } from "@tanstack/react-router";
import { MasterPage } from "@/components/master/MasterPage";

export const Route = createFileRoute("/master")({ component: MasterPage });
