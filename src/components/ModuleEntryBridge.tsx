import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

// Compatibility bridge for the legacy sidebar footer. The visual sidebar is old code;
// this turns the existing CLÍNICA row into a real navigable control without coupling
// the new Clinic module to the laboratory menu implementation.
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
        row.setAttribute("aria-label", "Abrir gestão da Clínica");
      }
      return row;
    };

    const activate = (event: Event) => {
      const row = findClinicEntry();
      if (!row) return;
      const target = event.target as Node | null;
      if (target && row.contains(target)) {
        event.preventDefault();
        event.stopPropagation();
        navigate({ to: "/clinica" as any });
      }
    };
    const keyboard = (event: KeyboardEvent) => {
      const row = findClinicEntry();
      if (!row || document.activeElement !== row || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      navigate({ to: "/clinica" as any });
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
