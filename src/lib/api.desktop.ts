// Desktop-only compatibility facade.
//
// Most DentalFlow screens keep importing from `@/lib/api`. The Tauri build
// aliases that exact module to this facade so progressively migrated domains
// become local-first without forking the UI or changing the Web build.
export * from "./api";
export {
  fetchPatientLocalFirst as fetchPatient,
  fetchPatientsLocalFirst as fetchPatients,
} from "./patients-local-first";
export {
  fetchCaseByIdLocalFirst as fetchCaseById,
  fetchCasesLocalFirst as fetchCases,
  fetchPatientCasesLocalFirst as fetchPatientCases,
} from "./cases-local-first";
export {
  fetchCadistasLocalFirst as fetchCadistas,
  fetchCaseTypesLocalFirst as fetchCaseTypes,
  fetchComponentsLocalFirst as fetchComponents,
  fetchDoctorsLocalFirst as fetchDoctors,
  fetchImplantSystemsLocalFirst as fetchImplantSystems,
  fetchPhasesLocalFirst as fetchPhases,
  fetchProfileLocalFirst as fetchProfile,
  fetchScanJigsLocalFirst as fetchScanJigs,
  fetchStagesLocalFirst as fetchStages,
  fetchToothColorsLocalFirst as fetchToothColors,
} from "./reference-local-first";
