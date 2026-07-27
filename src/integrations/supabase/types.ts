export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      backups: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_size_bytes: number | null
          id: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_size_bytes?: number | null
          id?: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          notes?: string | null
        }
        Relationships: []
      }
      burr_usages: {
        Row: {
          burr_id: string
          case_id: string | null
          created_at: string
          id: string
          material: string
          milled_at: string
          notes: string | null
          teeth_count: number
          teeth_numbers: number[]
        }
        Insert: {
          burr_id: string
          case_id?: string | null
          created_at?: string
          id?: string
          material: string
          milled_at?: string
          notes?: string | null
          teeth_count?: number
          teeth_numbers?: number[]
        }
        Update: {
          burr_id?: string
          case_id?: string | null
          created_at?: string
          id?: string
          material?: string
          milled_at?: string
          notes?: string | null
          teeth_count?: number
          teeth_numbers?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "burr_usages_burr_id_fkey"
            columns: ["burr_id"]
            isOneToOne: false
            referencedRelation: "burrs"
            referencedColumns: ["id"]
          },
        ]
      }
      burrs: {
        Row: {
          code: string | null
          created_at: string
          holder_id: string | null
          id: string
          installed_at: string
          material: string
          name: string
          notes: string | null
          removed_at: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          holder_id?: string | null
          id?: string
          installed_at?: string
          material: string
          name: string
          notes?: string | null
          removed_at?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          holder_id?: string | null
          id?: string
          installed_at?: string
          material?: string
          name?: string
          notes?: string | null
          removed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "burrs_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "holders"
            referencedColumns: ["id"]
          },
        ]
      }
      cadistas: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      case_attachments: {
        Row: {
          case_id: string
          created_at: string
          expired_at: string | null
          expires_at: string
          file_name: string
          id: string
          mime_type: string | null
          notes: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          expired_at?: string | null
          expires_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          expired_at?: string | null
          expires_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      case_components: {
        Row: {
          case_id: string
          component_id: string
          created_at: string
          id: string
          notes: string | null
          qty: number
        }
        Insert: {
          case_id: string
          component_id: string
          created_at?: string
          id?: string
          notes?: string | null
          qty?: number
        }
        Update: {
          case_id?: string
          component_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "case_components_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
        ]
      }
      case_stages: {
        Row: {
          case_id: string
          completed_at: string | null
          created_at: string
          id: string
          pending_count: number
          position: number
          stage_id: string
          started_at: string | null
        }
        Insert: {
          case_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          pending_count?: number
          position?: number
          stage_id: string
          started_at?: string | null
        }
        Update: {
          case_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          pending_count?: number
          position?: number
          stage_id?: string
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_stages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_stages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      case_types: {
        Row: {
          abbreviation: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          abbreviation?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          abbreviation?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      case_types_link: {
        Row: {
          case_id: string
          case_type_id: string
          created_at: string
        }
        Insert: {
          case_id: string
          case_type_id: string
          created_at?: string
        }
        Update: {
          case_id?: string
          case_type_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_types_link_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_types_link_case_type_id_fkey"
            columns: ["case_type_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          arch: string | null
          cadista_id: string | null
          case_label: string | null
          case_type_id: string | null
          created_at: string
          current_phase_id: string | null
          current_stage_id: string | null
          delivery_date: string
          dissilicato_stock_item_id: string | null
          doctor_id: string | null
          elements_count: number
          elements_dissilicato: number
          elements_zirconia: number
          entry_date: string
          finished_at: string | null
          folder_done: boolean
          folder_url: string | null
          id: string
          model_done: boolean
          notes: string | null
          patient_id: string
          reopened_at: string | null
          reopened_count: number
          scan_done: boolean
          sibling_case_id: string | null
          status: string
          stock_consumed_at: string | null
          teeth_dissilicato: number[]
          teeth_numbers: number[]
          teeth_zirconia: number[]
          tooth_color_id: string | null
          updated_at: string
          zirconia_stock_item_id: string | null
        }
        Insert: {
          arch?: string | null
          cadista_id?: string | null
          case_label?: string | null
          case_type_id?: string | null
          created_at?: string
          current_phase_id?: string | null
          current_stage_id?: string | null
          delivery_date: string
          dissilicato_stock_item_id?: string | null
          doctor_id?: string | null
          elements_count?: number
          elements_dissilicato?: number
          elements_zirconia?: number
          entry_date?: string
          finished_at?: string | null
          folder_done?: boolean
          folder_url?: string | null
          id?: string
          model_done?: boolean
          notes?: string | null
          patient_id: string
          reopened_at?: string | null
          reopened_count?: number
          scan_done?: boolean
          sibling_case_id?: string | null
          status?: string
          stock_consumed_at?: string | null
          teeth_dissilicato?: number[]
          teeth_numbers?: number[]
          teeth_zirconia?: number[]
          tooth_color_id?: string | null
          updated_at?: string
          zirconia_stock_item_id?: string | null
        }
        Update: {
          arch?: string | null
          cadista_id?: string | null
          case_label?: string | null
          case_type_id?: string | null
          created_at?: string
          current_phase_id?: string | null
          current_stage_id?: string | null
          delivery_date?: string
          dissilicato_stock_item_id?: string | null
          doctor_id?: string | null
          elements_count?: number
          elements_dissilicato?: number
          elements_zirconia?: number
          entry_date?: string
          finished_at?: string | null
          folder_done?: boolean
          folder_url?: string | null
          id?: string
          model_done?: boolean
          notes?: string | null
          patient_id?: string
          reopened_at?: string | null
          reopened_count?: number
          scan_done?: boolean
          sibling_case_id?: string | null
          status?: string
          stock_consumed_at?: string | null
          teeth_dissilicato?: number[]
          teeth_numbers?: number[]
          teeth_zirconia?: number[]
          tooth_color_id?: string | null
          updated_at?: string
          zirconia_stock_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_cadista_id_fkey"
            columns: ["cadista_id"]
            isOneToOne: false
            referencedRelation: "cadistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_case_type_id_fkey"
            columns: ["case_type_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_current_phase_id_fkey"
            columns: ["current_phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_dissilicato_stock_item_id_fkey"
            columns: ["dissilicato_stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_sibling_case_id_fkey"
            columns: ["sibling_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_tooth_color_id_fkey"
            columns: ["tooth_color_id"]
            isOneToOne: false
            referencedRelation: "tooth_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_zirconia_stock_item_id_fkey"
            columns: ["zirconia_stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_members: {
        Row: {
          clinic_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_members_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          company_type: string
          created_at: string
          id: string
          invite_code: string | null
          kind: string | null
          modules_enabled: string[]
          name: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          company_type?: string
          created_at?: string
          id?: string
          invite_code?: string | null
          kind?: string | null
          modules_enabled?: string[]
          name: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          company_type?: string
          created_at?: string
          id?: string
          invite_code?: string | null
          kind?: string | null
          modules_enabled?: string[]
          name?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      components: {
        Row: {
          category: string | null
          created_at: string
          id: string
          manufacturer: string | null
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          manufacturer?: string | null
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          manufacturer?: string | null
          name?: string
        }
        Relationships: []
      }
      doctors: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      holders: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      implant_systems: {
        Row: {
          created_at: string
          id: string
          manufacturer: string | null
          name: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          manufacturer?: string | null
          name: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          manufacturer?: string | null
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          content: string
          created_at: string | null
          id: string
          read_at: string | null
          recipient_id: string | null
          sender_id: string | null
          title: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          read_at?: string | null
          recipient_id?: string | null
          sender_id?: string | null
          title: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          read_at?: string | null
          recipient_id?: string | null
          sender_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          photo_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          photo_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          photo_url?: string | null
        }
        Relationships: []
      }
      phases: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          position: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_subtype: string | null
          avatar_url: string | null
          clinic_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_default_admin: boolean
          phone: string | null
          role: string | null
          updated_at: string
          user_code: string | null
        }
        Insert: {
          account_subtype?: string | null
          avatar_url?: string | null
          clinic_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_default_admin?: boolean
          phone?: string | null
          role?: string | null
          updated_at?: string
          user_code?: string | null
        }
        Update: {
          account_subtype?: string | null
          avatar_url?: string | null
          clinic_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_default_admin?: boolean
          phone?: string | null
          role?: string | null
          updated_at?: string
          user_code?: string | null
        }
        Relationships: []
      }
      stages: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          phase_id: string | null
          position: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          phase_id?: string | null
          position?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          phase_id?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "stages_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          block_type: string | null
          brand: string | null
          category: Database["public"]["Enums"]["stock_category"]
          color: string | null
          component_id: string | null
          created_at: string
          id: string
          min_qty: number
          name: string
          notes: string | null
          qty_on_hand: number
          unit: string
          updated_at: string
        }
        Insert: {
          block_type?: string | null
          brand?: string | null
          category: Database["public"]["Enums"]["stock_category"]
          color?: string | null
          component_id?: string | null
          created_at?: string
          id?: string
          min_qty?: number
          name: string
          notes?: string | null
          qty_on_hand?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          block_type?: string | null
          brand?: string | null
          category?: Database["public"]["Enums"]["stock_category"]
          color?: string | null
          component_id?: string | null
          created_at?: string
          id?: string
          min_qty?: number
          name?: string
          notes?: string | null
          qty_on_hand?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          case_id: string | null
          created_at: string
          id: string
          notes: string | null
          qty: number
          qty_after: number
          qty_before: number
          stock_item_id: string
          type: Database["public"]["Enums"]["stock_movement_type"]
          user_id: string | null
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          qty: number
          qty_after: number
          qty_before: number
          stock_item_id: string
          type: Database["public"]["Enums"]["stock_movement_type"]
          user_id?: string | null
        }
        Update: {
          case_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          qty?: number
          qty_after?: number
          qty_before?: number
          stock_item_id?: string
          type?: Database["public"]["Enums"]["stock_movement_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tooth_colors: {
        Row: {
          code: string
          created_at: string
          id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_case: { Args: { _case_id: string }; Returns: boolean }
      generate_user_code: { Args: never; Returns: string }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_cadista: { Args: { _user_id: string }; Returns: boolean }
      is_clinic_member: {
        Args: { _clinic_id: string; _user_id: string }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "dentista"
        | "recepcionista"
        | "auxiliar"
        | "protetico"
        | "cadista"
      stock_category: "zirconia" | "dissilicato" | "component" | "hygiene"
      stock_movement_type:
        | "in"
        | "out"
        | "auto_case"
        | "reverse_case"
        | "adjust"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "dentista",
        "recepcionista",
        "auxiliar",
        "protetico",
        "cadista",
      ],
      stock_category: ["zirconia", "dissilicato", "component", "hygiene"],
      stock_movement_type: ["in", "out", "auto_case", "reverse_case", "adjust"],
    },
  },
} as const
