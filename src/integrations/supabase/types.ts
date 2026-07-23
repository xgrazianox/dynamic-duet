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
            foreignKeyName: "operations_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments_v"
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
          {
            foreignKeyName: "operations_reversal_of_operation_id_fkey"
            columns: ["reversal_of_operation_id"]
            isOneToOne: true
            referencedRelation: "operations_v"
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
            foreignKeyName: "psettings_gold_fk"
            columns: ["gold_instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psettings_msci_fk"
            columns: ["msci_instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psettings_msci_fk"
            columns: ["msci_instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments_v"
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
          {
            foreignKeyName: "price_points_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments_v"
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
            foreignKeyName: "target_allocations_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments_v"
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
      fx_rates_v: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"] | null
          eur_per_unit: string | null
          portfolio_id: string | null
          rate_date: string | null
        }
        Insert: {
          currency?: Database["public"]["Enums"]["currency_code"] | null
          eur_per_unit?: never
          portfolio_id?: string | null
          rate_date?: string | null
        }
        Update: {
          currency?: Database["public"]["Enums"]["currency_code"] | null
          eur_per_unit?: never
          portfolio_id?: string | null
          rate_date?: string | null
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
      instruments_v: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"] | null
          id: string | null
          instrument_type: Database["public"]["Enums"]["instrument_type"] | null
          name: string | null
          portfolio_id: string | null
          quantity_step: string | null
          regime_class: Database["public"]["Enums"]["regime_class"] | null
          sleeve: Database["public"]["Enums"]["sleeve"] | null
          status: string | null
          ticker: string | null
        }
        Insert: {
          currency?: Database["public"]["Enums"]["currency_code"] | null
          id?: string | null
          instrument_type?:
            | Database["public"]["Enums"]["instrument_type"]
            | null
          name?: string | null
          portfolio_id?: string | null
          quantity_step?: never
          regime_class?: Database["public"]["Enums"]["regime_class"] | null
          sleeve?: Database["public"]["Enums"]["sleeve"] | null
          status?: never
          ticker?: string | null
        }
        Update: {
          currency?: Database["public"]["Enums"]["currency_code"] | null
          id?: string | null
          instrument_type?:
            | Database["public"]["Enums"]["instrument_type"]
            | null
          name?: string | null
          portfolio_id?: string | null
          quantity_step?: never
          regime_class?: Database["public"]["Enums"]["regime_class"] | null
          sleeve?: Database["public"]["Enums"]["sleeve"] | null
          status?: never
          ticker?: string | null
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
      operations_v: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"] | null
          effective_date: string | null
          fees_eur: string | null
          fx_eur_per_unit: string | null
          gross_amount_eur: string | null
          id: string | null
          instrument_id: string | null
          notes: string | null
          op_type: Database["public"]["Enums"]["op_type"] | null
          opening_cost_eur: string | null
          portfolio_id: string | null
          price_ccy: string | null
          quantity: string | null
          recorded_at: string | null
          reversal_of_operation_id: string | null
          seq: string | null
          source_batch_id: string | null
        }
        Insert: {
          currency?: Database["public"]["Enums"]["currency_code"] | null
          effective_date?: string | null
          fees_eur?: never
          fx_eur_per_unit?: never
          gross_amount_eur?: never
          id?: string | null
          instrument_id?: string | null
          notes?: string | null
          op_type?: Database["public"]["Enums"]["op_type"] | null
          opening_cost_eur?: never
          portfolio_id?: string | null
          price_ccy?: never
          quantity?: never
          recorded_at?: string | null
          reversal_of_operation_id?: string | null
          seq?: never
          source_batch_id?: string | null
        }
        Update: {
          currency?: Database["public"]["Enums"]["currency_code"] | null
          effective_date?: string | null
          fees_eur?: never
          fx_eur_per_unit?: never
          gross_amount_eur?: never
          id?: string | null
          instrument_id?: string | null
          notes?: string | null
          op_type?: Database["public"]["Enums"]["op_type"] | null
          opening_cost_eur?: never
          portfolio_id?: string | null
          price_ccy?: never
          quantity?: never
          recorded_at?: string | null
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
            foreignKeyName: "operations_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments_v"
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
          {
            foreignKeyName: "operations_reversal_of_operation_id_fkey"
            columns: ["reversal_of_operation_id"]
            isOneToOne: true
            referencedRelation: "operations_v"
            referencedColumns: ["id"]
          },
        ]
      }
      price_points_v: {
        Row: {
          close_price: string | null
          instrument_id: string | null
          price_date: string | null
          source: Database["public"]["Enums"]["price_source"] | null
        }
        Insert: {
          close_price?: never
          instrument_id?: string | null
          price_date?: string | null
          source?: Database["public"]["Enums"]["price_source"] | null
        }
        Update: {
          close_price?: never
          instrument_id?: string | null
          price_date?: string | null
          source?: Database["public"]["Enums"]["price_source"] | null
        }
        Relationships: [
          {
            foreignKeyName: "price_points_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_points_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments_v"
            referencedColumns: ["id"]
          },
        ]
      }
      target_allocations_v: {
        Row: {
          instrument_id: string | null
          target_set_id: string | null
          weight: string | null
        }
        Insert: {
          instrument_id?: string | null
          target_set_id?: string | null
          weight?: never
        }
        Update: {
          instrument_id?: string | null
          target_set_id?: string | null
          weight?: never
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
            foreignKeyName: "target_allocations_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments_v"
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
    }
    Functions: {
      _idem_begin: {
        Args: { _hash: string; _key: string; _pid: string; _rpc: string }
        Returns: Record<string, unknown>
      }
      _idem_commit: {
        Args: { _mreq_id: string; _result: Json }
        Returns: undefined
      }
      _owned_portfolio: { Args: never; Returns: string }
      _replay_check: { Args: { _pid: string }; Returns: undefined }
      amend_opening_import: {
        Args: { _key: string; _payload: Json }
        Returns: Json
      }
      bootstrap_user_data: { Args: { _user_id: string }; Returns: string }
      import_opening_balances: {
        Args: { _key: string; _payload: Json }
        Returns: Json
      }
      persist_regime_decision: { Args: { _payload: Json }; Returns: Json }
      register_operation: {
        Args: { _key: string; _payload: Json }
        Returns: Json
      }
      register_reversal: {
        Args: { _key: string; _payload: Json }
        Returns: Json
      }
      save_target_set: { Args: { _key: string; _payload: Json }; Returns: Json }
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
