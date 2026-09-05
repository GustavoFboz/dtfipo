import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { startEnvironmentTransition } from "@/components/EnvironmentTransition";

// Compatibility bridge for the legacy laboratory sidebar footer. The visual
// sidebar is legacy code; this turns the existing CLÍNICA row into a real
// environment switch without coupling the Clinic module to the lab menu.
export function ModuleEntryBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const findClinicEntry = () => {
      const aside = document.querySelector("aside");
      if (!aside) return null;
      const spans = Array.from(aside.querySelectorAll("span"));
      const label = spans.find((el) => el.textContent?.trim().toUpperCase() === "CLÍNICA");
      const row = label?.closest("div.group") as HTMLElement | null;
      if (row) {
        row.style.cursor = "pointer";
        row.setAttribute("role", "link");
        row.setAttribute("tabindex", "0");
        row.setAttribute("aria-label", "Trocar para o ambiente Clínica");
      }
      return row;
    };

    const openClinic = () => {
      startEnvironmentTransition("Clínica", () => navigate({ to: "/clinica" as any }));
    };

    const activate = (event: Event) => {
      const row = findClinicEntry();
      if (!row) return;
      const target = event.target as Node | null;
      if (target && row.contains(target)) {
        event.preventDefault();
        event.stopPropagation();
        openClinic();
      }
    };
    const keyboard = (event: KeyboardEvent) => {
      const row = findClinicEntry();
      if (!row || document.activeElement !== row || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      openClinic();
    };

    findClinicEntry();
    const observer = new MutationObserver(findClinicEntry);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", activate, true);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", activate, true);
      document.removeEventListener("keydown", keyboard, true);
    };
  }, [navigate]);

  return null;
}
