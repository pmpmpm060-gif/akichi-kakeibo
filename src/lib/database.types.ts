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
      admin_security_events: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          target_user_id: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          target_user_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          target_user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount: number
          category_id: string
          household_id: string
          id: string
          user_id: string
        }
        Insert: {
          amount?: number
          category_id: string
          household_id?: string
          id?: string
          user_id?: string
        }
        Update: {
          amount?: number
          category_id?: string
          household_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          carryover_enabled: boolean
          carryover_start_month: string | null
          created_at: string
          deleted_at: string | null
          household_id: string
          icon: string | null
          id: string
          name: string
          sort_order: number
          type: string
          user_id: string
        }
        Insert: {
          carryover_enabled?: boolean
          carryover_start_month?: string | null
          created_at?: string
          deleted_at?: string | null
          household_id?: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
          type: string
          user_id?: string
        }
        Update: {
          carryover_enabled?: boolean
          carryover_start_month?: string | null
          created_at?: string
          deleted_at?: string | null
          household_id?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      carryover_adjustment_history: {
        Row: {
          adjustment_id: string | null
          after_amount: number
          after_reason: string
          before_amount: number | null
          before_reason: string | null
          changed_at: string
          changed_by: string
          household_id: string
          id: string
          month: string
          user_id: string
        }
        Insert: {
          adjustment_id?: string | null
          after_amount: number
          after_reason: string
          before_amount?: number | null
          before_reason?: string | null
          changed_at?: string
          changed_by?: string
          household_id: string
          id?: string
          month: string
          user_id: string
        }
        Update: {
          adjustment_id?: string | null
          after_amount?: number
          after_reason?: string
          before_amount?: number | null
          before_reason?: string | null
          changed_at?: string
          changed_by?: string
          household_id?: string
          id?: string
          month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carryover_adjustment_history_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "carryover_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carryover_adjustment_history_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      carryover_adjustments: {
        Row: {
          amount: number
          household_id: string
          id: string
          month: string
          reason: string
          updated_at: string
          updated_by: string
          user_id: string
        }
        Insert: {
          amount?: number
          household_id?: string
          id?: string
          month: string
          reason: string
          updated_at?: string
          updated_by?: string
          user_id: string
        }
        Update: {
          amount?: number
          household_id?: string
          id?: string
          month?: string
          reason?: string
          updated_at?: string
          updated_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carryover_adjustments_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      dismissed_alerts: {
        Row: {
          alert_key: string
          dismissed_at: string
          household_id: string
          id: string
          user_id: string
        }
        Insert: {
          alert_key: string
          dismissed_at?: string
          household_id?: string
          id?: string
          user_id: string
        }
        Update: {
          alert_key?: string
          dismissed_at?: string
          household_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dismissed_alerts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          household_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_profiles: {
        Row: {
          auth_user_id: string | null
          created_at: string
          display_name: string
          household_id: string
          icon: string
          profile_id: string
          sort_order: number
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          display_name: string
          household_id: string
          icon?: string
          profile_id: string
          sort_order?: number
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string
          household_id?: string
          icon?: string
          profile_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "household_profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      monthly_reviews: {
        Row: {
          content: string
          household_id: string
          id: string
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          household_id?: string
          id?: string
          month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          household_id?: string
          id?: string
          month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_reviews_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_transactions: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          day_of_month: number
          description: string
          enabled: boolean
          end_month: string | null
          household_id: string
          id: string
          start_month: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          day_of_month: number
          description?: string
          enabled?: boolean
          end_month?: string | null
          household_id?: string
          id?: string
          start_month: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          day_of_month?: number
          description?: string
          enabled?: boolean
          end_month?: string | null
          household_id?: string
          id?: string
          start_month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_contributions: {
        Row: {
          amount: number
          contribution_date: string
          created_at: string
          goal_id: string
          household_id: string
          id: string
          note: string
          user_id: string
        }
        Insert: {
          amount: number
          contribution_date?: string
          created_at?: string
          goal_id: string
          household_id?: string
          id?: string
          note?: string
          user_id: string
        }
        Update: {
          amount?: number
          contribution_date?: string
          created_at?: string
          goal_id?: string
          household_id?: string
          id?: string
          note?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_contributions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_contributions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          created_at: string
          household_id: string
          id: string
          name: string
          target_amount: number
          target_date: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id?: string
          id?: string
          name: string
          target_amount: number
          target_date?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          name?: string
          target_amount?: number
          target_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_templates: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          description: string
          household_id: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          description?: string
          household_id?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          description?: string
          household_id?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_templates_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          budget_offset_category_id: string | null
          budget_offset_type: string
          category_id: string
          created_at: string
          date: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          description: string
          household_id: string
          id: string
          recurring_month: string | null
          recurring_transaction_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          budget_offset_category_id?: string | null
          budget_offset_type?: string
          category_id: string
          created_at?: string
          date: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          description?: string
          household_id?: string
          id?: string
          recurring_month?: string | null
          recurring_transaction_id?: string | null
          type: string
          user_id?: string
        }
        Update: {
          amount?: number
          budget_offset_category_id?: string | null
          budget_offset_type?: string
          category_id?: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          description?: string
          household_id?: string
          id?: string
          recurring_month?: string | null
          recurring_transaction_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_budget_offset_category_id_fkey"
            columns: ["budget_offset_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_transaction_id_fkey"
            columns: ["recurring_transaction_id"]
            isOneToOne: false
            referencedRelation: "recurring_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_correction_history: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json
          changed_at: string
          changed_by: string
          household_id: string
          id: string
          reason: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data: Json
          changed_at?: string
          changed_by?: string
          household_id: string
          id?: string
          reason: string
          transaction_id: string
          user_id: string
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json
          changed_at?: string
          changed_by?: string
          household_id?: string
          id?: string
          reason?: string
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_correction_history_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_correction_history_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_operation_activity: {
        Row: {
          last_operated_at: string
          last_path: string
          user_id: string
        }
        Insert: {
          last_operated_at?: string
          last_path?: string
          user_id: string
        }
        Update: {
          last_operated_at?: string
          last_path?: string
          user_id?: string
        }
        Relationships: []
      }
      user_approvals: {
        Row: {
          email: string
          is_admin: boolean
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          email: string
          is_admin?: boolean
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          email?: string
          is_admin?: boolean
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_household_profile: {
        Args: { target_profile_id: string; target_user_id: string }
        Returns: undefined
      }
      can_edit_profile: {
        Args: { target_household_id: string; target_profile_id: string }
        Returns: boolean
      }
      create_transaction_with_tags: {
        Args: {
          target_amount: number
          target_budget_offset_category_id?: string | null
          target_budget_offset_type?: string
          target_category_id: string
          target_date: string
          target_description: string
          target_user_id: string
        }
        Returns: string
      }
      current_household_id: { Args: never; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      delete_unused_category: {
        Args: { target_category_id: string }
        Returns: number
      }
      generate_recurring_transactions: {
        Args: { target_month: string; target_user_id: string }
        Returns: number
      }
      get_effective_budgets: {
        Args: { target_month: string; target_user_id: string }
        Returns: {
          amount: number
          base_amount: number
          carryover_amount: number
          category_id: string
          category_type: string
        }[]
      }
      get_savings_goal_totals: {
        Args: { target_user_id: string }
        Returns: {
          goal_id: string
          total: number
        }[]
      }
      list_user_approvals_with_last_sign_in: {
        Args: never
        Returns: {
          email: string
          is_admin: boolean
          last_sign_in_at: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }[]
      }
      list_user_approvals_with_last_operation: {
        Args: never
        Returns: {
          email: string
          is_admin: boolean
          last_operation_at: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }[]
      }
      get_my_approval_status: { Args: never; Returns: string }
      is_app_admin: { Args: never; Returns: boolean }
      is_approved_user: { Args: never; Returns: boolean }
      is_household_member: {
        Args: { target_household_id: string }
        Returns: boolean
      }
      is_household_profile: {
        Args: { target_household_id: string; target_profile_id: string }
        Returns: boolean
      }
      request_app_approval: { Args: never; Returns: string }
      review_app_user: {
        Args: { approve: boolean; target_user_id: string }
        Returns: undefined
      }
      save_category_order: {
        Args: { category_ids: string[]; target_user_id: string }
        Returns: undefined
      }
      save_carryover_adjustment: {
        Args: {
          adjustment_reason: string
          target_amount: number
          target_month: string
          target_user_id: string
        }
        Returns: string
      }
      touch_user_operation: {
        Args: { operation_path: string }
        Returns: undefined
      }
      save_user_budgets: {
        Args: { budget_entries: Json; target_user_id: string }
        Returns: number
      }
      setup_personal_household: {
        Args: { display_name: string; household_name: string }
        Returns: string
      }
      update_transaction_with_history: {
        Args: {
          correction_reason?: string
          target_amount: number
          target_budget_offset_category_id?: string | null
          target_budget_offset_type?: string
          target_category_id: string
          target_date: string
          target_description: string
          target_transaction_id: string
        }
        Returns: string
      }
      void_transaction_with_history: {
        Args: { correction_reason: string; target_transaction_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
