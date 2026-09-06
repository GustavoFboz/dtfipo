// Desktop-only clinic facade.
//
// The Web build continues using `@/lib/clinic` directly. The Tauri build aliases
// that module to this file so the existing Clinic UI can become local-first
// without forking screens or duplicating routes.
export * from "./clinic";
export {
  cancelClinicAppointmentLocalFirst as cancelClinicAppointment,
  fetchClinicAppointmentsLocalFirst as fetchClinicAppointments,
  fetchClinicContextLocalFirst as fetchClinicContext,
  saveClinicAppointmentLocalFirst as saveClinicAppointment,
} from "./clinic-local-first";
