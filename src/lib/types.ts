export type UserRole = "CEO" | "DR" | "PROTETICO" | "ATENDIMENTO" | "CADISTA" | "SOLICITANTE" | "USER";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  account_subtype: string | null;
  is_default_admin: boolean;
  user_code: string;
  clinic_id: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  notification_preferences?: {
    prosthesis_updates: boolean;
  };
};

export type Clinic = {
  id: string;
  name: string;
  slug: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClinicMember = {
  id: string;
  clinic_id: string;
  user_id: string;
  role: string;
  status: "pending" | "active" | "rejected";
  invited_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  clinic?: Clinic;
  profile?: Profile;
};

export type Notification = {
  id: string;
  sender_id: string | null;
  recipient_id: string | null;
  title: string;
  content: string;
  read_at: string | null;
  created_at: string;
  type?: string;
  metadata?: Record<string, unknown> | null;
  sender?: Profile | null;

};

export type Doctor = { id: string; name: string };
export type Cadista = { id: string; name: string; user_id?: string | null };
export type Patient = {
  id: string;
  name: string;
  photo_url: string | null;
  notes: string | null;
  first_name: string | null;
  last_name: string | null;
  age: number;
  birth_date: string | null;
  gender: string | null;
  cpf: string | null;
  rg: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  medical_history: string | null;
  allergies: string | null;
  medications: string | null;
  clinical_notes: string | null;
  cases?: CaseRow[] | null;
  created_at?: string;
};

export type PatientAttachment = {
  id: string;
  patient_id: string;
  title: string;
  description: string | null;
  kind: string;
  file_url: string;
  file_path: string;
  thumbnail_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};
export type CaseType = { id: string; name: string; abbreviation: string | null };
export type ToothColor = { id: string; code: string };
export type Phase = { id: string; name: string; color: string; position: number };
export type Stage = { id: string; name: string; color: string; position: number; phase_id: string | null };
export type Component = { id: string; name: string; category: string | null; manufacturer: string | null };

export type CaseComponentRow = {
  id: string;
  qty: number;
  notes: string | null;
  component: Component;
};

export type CaseStageRow = {
  id: string;
  pending_count: number;
  stage: Stage;
  started_at: string | null;
  completed_at: string | null;
};

export type ImplantSystem = { id: string; name: string; line: string | null };
export type ScanJig = { id: string; name: string; implant_system_id: string | null };
export type ComponentCategory = { id: string; name: string };

export type CaseRow = {
  id: string;
  created_at?: string | null;
  updated_at?: string | null;
  patient_id: string;
  doctor_id: string | null;
  cadista_id: string | null;
  case_type_id: string | null;
  tooth_color_id: string | null;
  case_label: string | null;
  case_number?: number | null;
  entry_date: string;
  delivery_date: string;
  finished_at: string | null;
  finished?: boolean | null;

  status: string;
  model_done: boolean;
  scan_done: boolean;
  folder_done: boolean;
  folder_url: string | null;
  notes: string | null;
  arch: string | null;
  sibling_case_id: string | null;
  current_stage_id: string | null;
  current_phase_id: string | null;
  reopened_at: string | null;
  reopened_count: number;
  teeth_numbers: number[];
  elements_count: number;
  elements_zirconia: number;
  elements_dissilicato: number;
  teeth_zirconia: number[];
  teeth_dissilicato: number[];
  patient: Patient | null;
  doctor: Doctor | null;
  cadista: Cadista | null;
  case_type: CaseType | null;
  tooth_color: ToothColor | null;
  current_stage: Stage | null;
  case_stages: CaseStageRow[];
  case_components: CaseComponentRow[];
  case_types_link?: { case_type_id: string; case_type: CaseType | null }[];
  zirconia_stock_item_id?: string | null;
  dissilicato_stock_item_id?: string | null;
  stock_consumed_at?: string | null;
  implant_system_id?: string | null;
  implant_system_ids?: string[] | null;
  implant_teeth?: number[] | null;
  scan_jig_id?: string | null;
  has_provisional?: boolean | null;
  tooth_case_types?: Record<string, string[]> | null;
  tooth_ti_bases?: Record<string, string> | null;
  tooth_implant_systems?: Record<string, string> | null;
  implant_system?: ImplantSystem | null;
  scan_jig?: ScanJig | null;
  requested_by?: string | null;
};

export type StockCategory = "zirconia" | "dissilicato" | "component" | "hygiene";
export type StockMovementType = "in" | "out" | "auto_case" | "reverse_case" | "adjust";

export type StockItem = {
  id: string;
  category: StockCategory;
  name: string;
  brand: string | null;
  color: string | null;
  block_type: string | null;
  unit: string;
  qty_on_hand: number;
  min_qty: number;
  component_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type StockMovement = {
  id: string;
  stock_item_id: string;
  type: StockMovementType;
  qty: number;
  qty_before: number;
  qty_after: number;
  case_id: string | null;
  user_id: string | null;
  notes: string | null;
  created_at: string;
  item?: StockItem | null;
};

