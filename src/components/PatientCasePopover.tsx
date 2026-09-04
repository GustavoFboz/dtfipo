import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, ExternalLink, X } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Patient, Profile } from "@/lib/types";

function formatDate(value: string | null | undefined) {
  if (!value) return "Não informado";
  const iso = value.slice(0, 10);
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "Não informado";
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function calculatePatientAge(birthDate: string | null | undefined, today = new Date()) {
  if (!birthDate) return null;
  const iso = birthDate.slice(0, 10);
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;

  let age = today.getFullYear() - year;
  const beforeBirthday =
    today.getMonth() + 1 < month ||
    (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function formatGender(gender: string | null | undefined) {
  if (!gender) return "Não informado";
  const normalized = gender.trim().toLowerCase();
  if (["f", "feminino", "female"].includes(normalized)) return "Feminino";
  if (["m", "masculino", "male"].includes(normalized)) return "Masculino";
  return gender;
}

function patientInitial(name: string | null | undefined) {
  return (name?.trim()?.[0] || "?").toUpperCase();
}

export function canSchedulePatient(profile: Profile | null | undefined) {
  if (!profile) return false;
  if (profile.is_default_admin) return true;
  const role = String(profile.role || "").toUpperCase();
  const subtype = String(profile.account_subtype || "").toUpperCase();
  const effectiveType = subtype || role;
  return ["CEO", "ADMIN", "DR", "DENTISTA"].includes(effectiveType);
}

export function PatientPhotoLightbox({
  patient,
  trigger,
}: {
  patient: Patient | null;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!patient?.photo_url) {
    return (
      <span onClick={(event) => event.stopPropagation()} className="contents">
        {trigger}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="contents"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Ampliar foto de ${patient.name}`}
      >
        {trigger}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/50 p-6 backdrop-blur-xl"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Foto de ${patient.name}`}
        >
          <button
            type="button"
            className="absolute right-6 top-6 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/20 text-white transition hover:bg-black/35"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
            }}
            aria-label="Fechar foto"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={patient.photo_url}
            alt={patient.name || "Foto do paciente"}
            className="max-h-[88vh] max-w-[92vw] rounded-[28px] object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

export function PatientCasePopover({
  patient,
  profile,
  entryDate,
  lastVisit,
  activeCasesCount,
  unreadBadge,
  avatarBadge,
  subtitle,
}: {
  patient: Patient | null;
  profile: Profile | null | undefined;
  entryDate?: string | null;
  lastVisit?: string | null;
  activeCasesCount?: number;
  unreadBadge?: ReactNode;
  avatarBadge?: ReactNode;
  subtitle?: ReactNode;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const age = useMemo(() => calculatePatientAge(patient?.birth_date), [patient?.birth_date]);
  const maySchedule = canSchedulePatient(profile);

  if (!patient) {
    return (
      <div className="flex items-center gap-4 min-w-0">
        <div className="h-11 w-11 rounded-full bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-500 text-sm font-light shrink-0">?</div>
        <span className="text-[17px] text-slate-400">—</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 min-w-0">
      <div className="relative shrink-0">
        <PatientPhotoLightbox
          patient={patient}
          trigger={
            <div className={`h-11 w-11 rounded-full bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-500 text-sm font-light overflow-hidden ring-0 transition ${patient.photo_url ? "hover:ring-4 hover:ring-primary/10 cursor-zoom-in" : "cursor-default"}`}>
              {patient.photo_url ? (
                <img src={patient.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                patientInitial(patient.name)
              )}
            </div>
          }
        />
        {avatarBadge}
      </div>

      <div className="min-w-0 flex-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="max-w-full text-left text-[17px] font-normal text-slate-900 dark:text-slate-100 truncate leading-tight hover:text-primary transition-colors"
              onClick={(event) => event.stopPropagation()}
            >
              <span>{patient.name || "—"}</span>
              {unreadBadge}
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={12}
            collisionPadding={20}
            onClick={(event) => event.stopPropagation()}
            className="w-[360px] overflow-hidden rounded-[24px] border border-slate-200/70 bg-white/95 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95"
          >
            <div className="p-5 pb-4">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-500 text-base font-light overflow-hidden shrink-0">
                  {patient.photo_url ? (
                    <img src={patient.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    patientInitial(patient.name)
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="truncate text-[21px] font-medium leading-tight text-slate-950 dark:text-white">
                    {patient.name}
                  </div>
                  <div className="mt-1 text-[12px] font-light text-slate-400">
                    {activeCasesCount ?? 0} {(activeCasesCount ?? 0) === 1 ? "caso em andamento" : "casos em andamento"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid h-8 w-8 place-items-center rounded-full text-slate-300 transition hover:bg-slate-100 hover:text-slate-500 dark:hover:bg-slate-800"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mx-4 rounded-2xl bg-slate-50/90 p-1 dark:bg-slate-900/80">
              <div className="grid grid-cols-2 gap-x-2 gap-y-0">
                <div className="rounded-xl p-3">
                  <div className="text-[11px] font-medium text-slate-400">Entrada</div>
                  <div className="mt-1 text-[14px] font-normal text-slate-800 dark:text-slate-100">{formatDate(entryDate)}</div>
                </div>
                <div className="rounded-xl p-3">
                  <div className="text-[11px] font-medium text-slate-400">Idade</div>
                  <div className="mt-1 text-[14px] font-normal text-slate-800 dark:text-slate-100">{age == null ? "Não informado" : `${age} anos`}</div>
                </div>
                <div className="rounded-xl p-3">
                  <div className="text-[11px] font-medium text-slate-400">Gênero</div>
                  <div className="mt-1 text-[14px] font-normal text-slate-800 dark:text-slate-100">{formatGender(patient.gender)}</div>
                </div>
                <div className="rounded-xl p-3">
                  <div className="text-[11px] font-medium text-slate-400">Última visita</div>
                  <div className="mt-1 text-[14px] font-normal text-slate-800 dark:text-slate-100">{formatDate(lastVisit)}</div>
                </div>
              </div>
            </div>

            <div className="space-y-2 p-4 pt-3">
              {maySchedule && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate({ to: "/agenda" });
                  }}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#5B9DF4] text-[13px] font-medium text-white shadow-sm transition hover:bg-[#4E8FE5]"
                >
                  <CalendarDays className="h-4 w-4" />
                  Agendar paciente
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate({ to: "/patients/$id", params: { id: patient.id } });
                }}
                className="mx-auto flex items-center gap-1.5 px-2 py-1 text-[11px] font-normal text-slate-400 transition hover:text-primary"
              >
                Ver perfil completo
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </PopoverContent>
        </Popover>
        {subtitle && <div className="mt-0.5 min-w-0">{subtitle}</div>}
      </div>
    </div>
  );
}
