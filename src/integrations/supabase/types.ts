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
      backend_backups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          schema_hash: string
          size_bytes: number
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          schema_hash: string
          size_bytes?: number
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          schema_hash?: string
          size_bytes?: number
          storage_path?: string | null
        }
        Relationships: []
      }
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
      case_activity: {
        Row: {
          attachment_id: string | null
          case_id: string
          content: string | null
          created_at: string
          id: string
          kind: string
          mentions: string[]
          metadata: Json
          user_id: string | null
        }
        Insert: {
          attachment_id?: string | null
          case_id: string
          content?: string | null
          created_at?: string
          id?: string
          kind: string
          mentions?: string[]
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          attachment_id?: string | null
          case_id?: string
          content?: string | null
          created_at?: string
          id?: string
          kind?: string
          mentions?: string[]
          metadata?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_activity_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_activity_reads: {
        Row: {
          activity_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_activity_reads_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "case_activity"
            referencedColumns: ["id"]
          },
        ]
      }
      case_attachments: {
        Row: {
          case_id: string
          created_at: string
          expired_at: string | null
          expires_at: string
          file_name: string
          id: string
          kind: string | null
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
          kind?: string | null
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
          kind?: string | null
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
      case_implant_teeth: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          id: string
          implant_system_id: string | null
          qty: number
          reversed_at: string | null
          stock_item_id: string
          tooth_fdi: number
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          implant_system_id?: string | null
          qty?: number
          reversed_at?: string | null
          stock_item_id: string
          tooth_fdi: number
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          implant_system_id?: string | null
          qty?: number
          reversed_at?: string | null
          stock_item_id?: string
          tooth_fdi?: number
        }
        Relationships: [
          {
            foreignKeyName: "case_implant_teeth_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_implant_teeth_implant_system_id_fkey"
            columns: ["implant_system_id"]
            isOneToOne: false
            referencedRelation: "implant_systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_implant_teeth_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
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
          case_number: number | null
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
          gum_info: Json | null
          has_provisional: boolean
          id: string
          implant_system_id: string | null
          implant_system_ids: string[]
          implant_teeth: number[]
          model_done: boolean
          notes: string | null
          patient_id: string
          reopened_at: string | null
          reopened_count: number
          scan_done: boolean
          scan_jig_id: string | null
          sibling_case_id: string | null
          status: string
          stock_consumed_at: string | null
          teeth_dissilicato: number[]
          teeth_numbers: number[]
          teeth_zirconia: number[]
          tooth_case_types: Json
          tooth_color_id: string | null
          tooth_implant_systems: Json
          tooth_ti_bases: Json
          updated_at: string
          zirconia_stock_item_id: string | null
        }
        Insert: {
          arch?: string | null
          cadista_id?: string | null
          case_label?: string | null
          case_number?: number | null
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
          gum_info?: Json | null
          has_provisional?: boolean
          id?: string
          implant_system_id?: string | null
          implant_system_ids?: string[]
          implant_teeth?: number[]
          model_done?: boolean
          notes?: string | null
          patient_id: string
          reopened_at?: string | null
          reopened_count?: number
          scan_done?: boolean
          scan_jig_id?: string | null
          sibling_case_id?: string | null
          status?: string
          stock_consumed_at?: string | null
          teeth_dissilicato?: number[]
          teeth_numbers?: number[]
          teeth_zirconia?: number[]
          tooth_case_types?: Json
          tooth_color_id?: string | null
          tooth_implant_systems?: Json
          tooth_ti_bases?: Json
          updated_at?: string
          zirconia_stock_item_id?: string | null
        }
        Update: {
          arch?: string | null
          cadista_id?: string | null
          case_label?: string | null
          case_number?: number | null
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
          gum_info?: Json | null
          has_provisional?: boolean
          id?: string
          implant_system_id?: string | null
          implant_system_ids?: string[]
          implant_teeth?: number[]
          model_done?: boolean
          notes?: string | null
          patient_id?: string
          reopened_at?: string | null
          reopened_count?: number
          scan_done?: boolean
          scan_jig_id?: string | null
          sibling_case_id?: string | null
          status?: string
          stock_consumed_at?: string | null
          teeth_dissilicato?: number[]
          teeth_numbers?: number[]
          teeth_zirconia?: number[]
          tooth_case_types?: Json
          tooth_color_id?: string | null
          tooth_implant_systems?: Json
          tooth_ti_bases?: Json
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
            foreignKeyName: "cases_implant_system_id_fkey"
            columns: ["implant_system_id"]
            isOneToOne: false
            referencedRelation: "implant_systems"
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
            foreignKeyName: "cases_scan_jig_id_fkey"
            columns: ["scan_jig_id"]
            isOneToOne: false
            referencedRelation: "scan_jigs"
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
          invited_by: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          invited_by?: string | null
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clinics: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invite_code: string | null
          kind: string
          name: string
          owner_id: string | null
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code?: string | null
          kind?: string
          name: string
          owner_id?: string | null
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code?: string | null
          kind?: string
          name?: string
          owner_id?: string | null
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      component_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
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
      implant_system_components: {
        Row: {
          component_type_id: string | null
          created_at: string
          id: string
          implant_system_id: string
          name: string
          sku: string | null
          updated_at: string
        }
        Insert: {
          component_type_id?: string | null
          created_at?: string
          id?: string
          implant_system_id: string
          name: string
          sku?: string | null
          updated_at?: string
        }
        Update: {
          component_type_id?: string | null
          created_at?: string
          id?: string
          implant_system_id?: string
          name?: string
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "implant_system_components_implant_system_id_fkey"
            columns: ["implant_system_id"]
            isOneToOne: false
            referencedRelation: "implant_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      implant_systems: {
        Row: {
          created_at: string
          id: string
          line: string | null
          manufacturer: string | null
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          line?: string | null
          manufacturer?: string | null
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          line?: string | null
          manufacturer?: string | null
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          content: string
          created_at: string | null
          id: string
          metadata: Json
          read_at: string | null
          recipient_id: string | null
          sender_id: string | null
          title: string
          type: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          recipient_id?: string | null
          sender_id?: string | null
          title: string
          type?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          recipient_id?: string | null
          sender_id?: string | null
          title?: string
          type?: string | null
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
          notification_preferences: Json
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
          notification_preferences?: Json
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
          notification_preferences?: Json
          phone?: string | null
          role?: string | null
          updated_at?: string
          user_code?: string | null
        }
        Relationships: []
      }
      scan_jigs: {
        Row: {
          created_at: string
          id: string
          implant_system_id: string | null
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          implant_system_id?: string | null
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          implant_system_id?: string | null
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_jigs_implant_system_id_fkey"
            columns: ["implant_system_id"]
            isOneToOne: false
            referencedRelation: "implant_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_assignments: {
        Row: {
          created_at: string
          id: string
          stage_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          stage_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          stage_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_assignments_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_return_reasons: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number
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
          requirements: Json
          requires_implant_components: boolean
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          phase_id?: string | null
          position?: number
          requirements?: Json
          requires_implant_components?: boolean
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          phase_id?: string | null
          position?: number
          requirements?: Json
          requires_implant_components?: boolean
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
      stock_item_custom_fields: {
        Row: {
          created_at: string
          id: string
          key: string
          stock_item_id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          stock_item_id: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          stock_item_id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_item_custom_fields_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          block_type: string | null
          brand: string | null
          category: Database["public"]["Enums"]["stock_category"]
          category_id: string | null
          color: string | null
          component_id: string | null
          created_at: string
          id: string
          implant_system_component_id: string | null
          min_qty: number
          name: string
          notes: string | null
          qty_on_hand: number
          type: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          block_type?: string | null
          brand?: string | null
          category: Database["public"]["Enums"]["stock_category"]
          category_id?: string | null
          color?: string | null
          component_id?: string | null
          created_at?: string
          id?: string
          implant_system_component_id?: string | null
          min_qty?: number
          name: string
          notes?: string | null
          qty_on_hand?: number
          type?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          block_type?: string | null
          brand?: string | null
          category?: Database["public"]["Enums"]["stock_category"]
          category_id?: string | null
          color?: string | null
          component_id?: string | null
          created_at?: string
          id?: string
          implant_system_component_id?: string | null
          min_qty?: number
          name?: string
          notes?: string | null
          qty_on_hand?: number
          type?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "component_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_implant_system_component_id_fkey"
            columns: ["implant_system_component_id"]
            isOneToOne: false
            referencedRelation: "implant_system_components"
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
      workflow_settings: {
        Row: {
          auto_advance_enabled: boolean
          id: boolean
          phases_enabled: boolean
          progress_bar_enabled: boolean
          stages_enabled: boolean
          updated_at: string
        }
        Insert: {
          auto_advance_enabled?: boolean
          id?: boolean
          phases_enabled?: boolean
          progress_bar_enabled?: boolean
          stages_enabled?: boolean
          updated_at?: string
        }
        Update: {
          auto_advance_enabled?: boolean
          id?: boolean
          phases_enabled?: boolean
          progress_bar_enabled?: boolean
          stages_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_case_workflow: {
        Args: { _case_id: string; _stage_id?: string }
        Returns: Json
      }
      backend_schema_hash: { Args: never; Returns: string }
      can_access_case: { Args: { _case_id: string }; Returns: boolean }
      case_stage_requirement_blockers: {
        Args: { _case_id: string }
        Returns: string[]
      }
      create_company_account: {
        Args: { p_full_name: string; p_kind: string; p_name: string }
        Returns: string
      }
      create_implant_system_with_stock: {
        Args: { _components: Json; _line: string; _name: string }
        Returns: Json
      }
      current_user_is_admin: { Args: never; Returns: boolean }
      export_backup: { Args: never; Returns: string }
      generate_clinic_invite_code: { Args: never; Returns: string }
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
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      register_case_implant_tooth: {
        Args: { _case_id: string; _stock_item_id: string; _tooth_fdi: number }
        Returns: Json
      }
      remove_case_implant_tooth: { Args: { _id: string }; Returns: Json }
      return_case_workflow: {
        Args: {
          _case_id: string
          _notes?: string
          _reason_id: string
          _to_stage_id?: string
        }
        Returns: Json
      }
      seed_default_workflow: { Args: never; Returns: Json }
      update_team_member: {
        Args: {
          p_category_ids?: string[]
          p_email: string
          p_full_name: string
          p_phone: string
          p_role: string
          p_user_id: string
        }
        Returns: Json
      }
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
