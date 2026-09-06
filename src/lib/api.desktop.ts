// Desktop-only compatibility facade.
//
// Most of the DentalFlow code can keep importing from `@/lib/api`. The Tauri
// Vite build aliases that exact module to this file so patient reads become
// local-first without duplicating or rewriting the rest of the application API.
export * from "./api";
export {
  fetchPatientLocalFirst as fetchPatient,
  fetchPatientsLocalFirst as fetchPatients,
} from "./patients-local-first";
