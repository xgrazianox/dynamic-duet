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
      fx_rates: {
        Row: {
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          eur_per_unit: number
          id: string
          portfolio_id: string
          rate_date: string
          source_batch_id: string | null
        }
        Insert: {
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          eur_per_unit: number
          id?: string
          portfolio_id: string
          rate_date: string
          source_batch_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          eur_per_unit?: number
          id?: string
          portfolio_id?: string
          rate_date?: string
          source_batch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      instruments: {
        Row: {
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          instrument_type: Database["public"]["Enums"]["instrument_type"]
          isin: string | null
          name: string
          portfolio_id: string
          quantity_step: number
          regime_class: Database["public"]["Enums"]["regime_class"]
          sleeve: Database["public"]["Enums"]["sleeve"]
          status: Database["public"]["Enums"]["instrument_status"]
          ticker: string
        }
        Insert: {
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          id?: string
          instrument_type: Database["public"]["Enums"]["instrument_type"]
          isin?: string | null
          name: string
          portfolio_id: string
          quantity_step?: number
          regime_class: Database["public"]["Enums"]["regime_class"]
          sleeve: Database["public"]["Enums"]["sleeve"]
          status?: Database["public"]["Enums"]["instrument_status"]
          ticker: string
        }
        Update: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          instrument_type?: Database["public"]["Enums"]["instrument_type"]
          isin?: string | null
          name?: string
          portfolio_id?: string
          quantity_step?: number
          regime_class?: Database["public"]["Enums"]["regime_class"]
          sleeve?: Database["public"]["Enums"]["sleeve"]
          status?: Database["public"]["Enums"]["instrument_status"]
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "instruments_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      mutation_requests: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          payload_hash: string
          portfolio_id: string
          result: Json | null
          rpc_name: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          payload_hash: string
          portfolio_id: string
          result?: Json | null
          rpc_name: string
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          payload_hash?: string
          portfolio_id?: string
          result?: Json | null
          rpc_name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mutation_requests_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      operations: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"] | null
          effective_date: string
          fees_eur: number
          fx_eur_per_unit: number | null
          gross_amount_eur: number | null
          id: string
          idempotency_key: string
          instrument_id: string | null
          notes: string | null
          op_type: Database["public"]["Enums"]["op_type"]
          opening_cost_eur: number | null
          payload_hash: string
          portfolio_id: string
          price_ccy: number | null
          quantity: number | null
          recorded_at: string
          reversal_of_operation_id: string | null
          seq: number
          source_batch_id: string | null
        }
        Insert: {
          currency?: Database["public"]["Enums"]["currency_code"] | null
          effective_date: string
          fees_eur?: number
          fx_eur_per_unit?: number | null
          gross_amount_eur?: number | null
          id?: string
          idempotency_key: string
          instrument_id?: string | null
          notes?: string | null
          op_type: Database["public"]["Enums"]["op_type"]
          opening_cost_eur?: number | null
          payload_hash: string
          portfolio_id: string
          price_ccy?: number | null
          quantity?: number | null
          recorded_at?: string
          reversal_of_operation_id?: string | null
          seq?: never
          source_batch_id?: string | null
        }
        Update: {
          currency?: Database["public"]["Enums"]["currency_code"] | null
          effective_date?: string
          fees_eur?: number
          fx_eur_per_unit?: number | null
          gross_amount_eur?: number | null
          id?: string
          idempotency_key?: string
          instrument_id?: string | null
          notes?: string | null
          op_type?: Database["public"]["Enums"]["op_type"]
          opening_cost_eur?: number | null
          payload_hash?: string
          portfolio_id?: string
          price_ccy?: number | null
          quantity?: number | null
          recorded_at?: string
          reversal_of_operation_id?: string | null
          seq?: never
          source_batch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operations_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_reversal_of_operation_id_fkey"
            columns: ["reversal_of_operation_id"]
            isOneToOne: true
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_settings: {
        Row: {
          default_fx: Json
          engine_config: Json
          gold_instrument_id: string | null
          last_applied_regime: Database["public"]["Enums"]["regime"] | null
          migration_completed: boolean
          min_trade_eur: number
          msci_instrument_id: string | null
          portfolio_id: string
          rounding_eur: number
          simulated_fee_eur: number
          stale_price_days: number
          take_profit_pct: number
          tilt_enabled: boolean
          tolerance_pp: number
        }
        Insert: {
          default_fx?: Json
          engine_config: Json
          gold_instrument_id?: string | null
          last_applied_regime?: Database["public"]["Enums"]["regime"] | null
          migration_completed?: boolean
          min_trade_eur?: number
          msci_instrument_id?: string | null
          portfolio_id: string
          rounding_eur?: number
          simulated_fee_eur?: number
          stale_price_days?: number
          take_profit_pct?: number
          tilt_enabled?: boolean
          tolerance_pp?: number
        }
        Update: {
          default_fx?: Json
          engine_config?: Json
          gold_instrument_id?: string | null
          last_applied_regime?: Database["public"]["Enums"]["regime"] | null
          migration_completed?: boolean
          min_trade_eur?: number
          msci_instrument_id?: string | null
          portfolio_id?: string
          rounding_eur?: number
          simulated_fee_eur?: number
          stale_price_days?: number
          take_profit_pct?: number
          tilt_enabled?: boolean
          tolerance_pp?: number
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_settings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: true
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psettings_gold_fk"
            columns: ["gold_instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psettings_msci_fk"
            columns: ["msci_instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          base_currency: Database["public"]["Enums"]["currency_code"]
          created_at: string
          id: string
          name: string
          tracking_started_on: string | null
          user_id: string
        }
        Insert: {
          base_currency?: Database["public"]["Enums"]["currency_code"]
          created_at?: string
          id?: string
          name?: string
          tracking_started_on?: string | null
          user_id: string
        }
        Update: {
          base_currency?: Database["public"]["Enums"]["currency_code"]
          created_at?: string
          id?: string
          name?: string
          tracking_started_on?: string | null
          user_id?: string
        }
        Relationships: []
      }
      price_points: {
        Row: {
          close_price: number
          created_at: string
          id: string
          instrument_id: string
          price_date: string
          source: Database["public"]["Enums"]["price_source"]
          source_batch_id: string | null
        }
        Insert: {
          close_price: number
          created_at?: string
          id?: string
          instrument_id: string
          price_date: string
          source: Database["public"]["Enums"]["price_source"]
          source_batch_id?: string | null
        }
        Update: {
          close_price?: number
          created_at?: string
          id?: string
          instrument_id?: string
          price_date?: string
          source?: Database["public"]["Enums"]["price_source"]
          source_batch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_points_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      regime_decisions: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          as_of_month: string
          config: Json
          config_hash: string
          decided_at: string
          decision_mode: string
          engine_version: string
          final_regime: Database["public"]["Enums"]["regime"] | null
          id: string
          input_fingerprint: string
          is_switch: boolean
          portfolio_id: string
          regime_a: Database["public"]["Enums"]["regime"] | null
          regime_b: Database["public"]["Enums"]["regime"] | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          as_of_month: string
          config: Json
          config_hash: string
          decided_at?: string
          decision_mode: string
          engine_version: string
          final_regime?: Database["public"]["Enums"]["regime"] | null
          id?: string
          input_fingerprint: string
          is_switch?: boolean
          portfolio_id: string
          regime_a?: Database["public"]["Enums"]["regime"] | null
          regime_b?: Database["public"]["Enums"]["regime"] | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          as_of_month?: string
          config?: Json
          config_hash?: string
          decided_at?: string
          decision_mode?: string
          engine_version?: string
          final_regime?: Database["public"]["Enums"]["regime"] | null
          id?: string
          input_fingerprint?: string
          is_switch?: boolean
          portfolio_id?: string
          regime_a?: Database["public"]["Enums"]["regime"] | null
          regime_b?: Database["public"]["Enums"]["regime"] | null
        }
        Relationships: [
          {
            foreignKeyName: "regime_decisions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      target_allocations: {
        Row: {
          id: string
          instrument_id: string | null
          target_set_id: string
          weight: number
        }
        Insert: {
          id?: string
          instrument_id?: string | null
          target_set_id: string
          weight: number
        }
        Update: {
          id?: string
          instrument_id?: string | null
          target_set_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "target_allocations_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "target_allocations_target_set_id_fkey"
            columns: ["target_set_id"]
            isOneToOne: false
            referencedRelation: "target_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      target_sets: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          portfolio_id: string
          regime: Database["public"]["Enums"]["regime"]
          status: Database["public"]["Enums"]["target_set_status"]
          version: number
        }
        Insert: {
          created_at?: string
          effective_from?: string
          id?: string
          portfolio_id: string
          regime: Database["public"]["Enums"]["regime"]
          status?: Database["public"]["Enums"]["target_set_status"]
          version: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          portfolio_id?: string
          regime?: Database["public"]["Enums"]["regime"]
          status?: Database["public"]["Enums"]["target_set_status"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "target_sets_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      currency_code: "EUR" | "USD" | "CHF"
      instrument_status: "active" | "archived"
      instrument_type: "ETF" | "ETC" | "STOCK" | "FUND" | "MONETARY"
      op_type:
        | "DEPOSIT"
        | "WITHDRAW"
        | "BUY"
        | "SELL"
        | "DIVIDEND"
        | "OTHER_INCOME"
        | "FEE"
        | "REVERSAL"
        | "OPENING_CASH"
        | "OPENING_POSITION"
      price_source: "manual" | "csv" | "opening"
      regime: "RISK_ON" | "RISK_OFF"
      regime_class: "DEFENSIVE" | "AGGRESSIVE" | "BOTH"
      sleeve: "CORE" | "FACTOR" | "THEME" | "HEDGE" | "MONETARY"
      target_set_status: "draft" | "active" | "superseded"
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
      currency_code: ["EUR", "USD", "CHF"],
      instrument_status: ["active", "archived"],
      instrument_type: ["ETF", "ETC", "STOCK", "FUND", "MONETARY"],
      op_type: [
        "DEPOSIT",
        "WITHDRAW",
        "BUY",
        "SELL",
        "DIVIDEND",
        "OTHER_INCOME",
        "FEE",
        "REVERSAL",
        "OPENING_CASH",
        "OPENING_POSITION",
      ],
      price_source: ["manual", "csv", "opening"],
      regime: ["RISK_ON", "RISK_OFF"],
      regime_class: ["DEFENSIVE", "AGGRESSIVE", "BOTH"],
      sleeve: ["CORE", "FACTOR", "THEME", "HEDGE", "MONETARY"],
      target_set_status: ["draft", "active", "superseded"],
    },
  },
} as const
