// Generated from the Fractionaire Supabase project (ghvetmhejqjhyswldwdn). Do not edit by hand.
// Regenerate with: npx supabase gen types typescript --project-id ghvetmhejqjhyswldwdn > src/types/database.ts (or the Supabase MCP generate_typescript_types tool).
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
      asset_categories: {
        Row: {
          created_at: string
          fields: Json
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          fields: Json
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          fields?: Json
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      assets: {
        Row: {
          available_supply: number | null
          business_id: string
          category_id: string
          chain_id: number
          created_at: string
          description: string | null
          erc20_token_address: string | null
          floor_price_per_fraction: number | null
          id: string
          internal_id: string | null
          kyc_required: boolean
          metadata: Json
          mint_price_per_fraction: number | null
          mint_tx_hash: string | null
          name: string
          nft_id: number | null
          status: Database["public"]["Enums"]["asset_status"]
          total_supply: number | null
          updated_at: string | null
          valuation: number | null
        }
        Insert: {
          available_supply?: number | null
          business_id: string
          category_id: string
          chain_id: number
          created_at?: string
          description?: string | null
          erc20_token_address?: string | null
          floor_price_per_fraction?: number | null
          id?: string
          internal_id?: string | null
          kyc_required?: boolean
          metadata?: Json
          mint_price_per_fraction?: number | null
          mint_tx_hash?: string | null
          name: string
          nft_id?: number | null
          status?: Database["public"]["Enums"]["asset_status"]
          total_supply?: number | null
          updated_at?: string | null
          valuation?: number | null
        }
        Update: {
          available_supply?: number | null
          business_id?: string
          category_id?: string
          chain_id?: number
          created_at?: string
          description?: string | null
          erc20_token_address?: string | null
          floor_price_per_fraction?: number | null
          id?: string
          internal_id?: string | null
          kyc_required?: boolean
          metadata?: Json
          mint_price_per_fraction?: number | null
          mint_tx_hash?: string | null
          name?: string
          nft_id?: number | null
          status?: Database["public"]["Enums"]["asset_status"]
          total_supply?: number | null
          updated_at?: string | null
          valuation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_marketplace"
            referencedColumns: ["category_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          diff: Json | null
          entity: string | null
          entity_id: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      business_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          logo_url: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          logo_url?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          logo_url?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chain_events: {
        Row: {
          args: Json | null
          block_number: number
          chain_id: number
          contract_address: string | null
          created_at: string
          error: string | null
          event_name: string
          id: string
          log_index: number
          processed: boolean
          processed_at: string | null
          tx_hash: string
          updated_at: string | null
        }
        Insert: {
          args?: Json | null
          block_number: number
          chain_id: number
          contract_address?: string | null
          created_at?: string
          error?: string | null
          event_name: string
          id?: string
          log_index: number
          processed?: boolean
          processed_at?: string | null
          tx_hash: string
          updated_at?: string | null
        }
        Update: {
          args?: Json | null
          block_number?: number
          chain_id?: number
          contract_address?: string | null
          created_at?: string
          error?: string | null
          event_name?: string
          id?: string
          log_index?: number
          processed?: boolean
          processed_at?: string | null
          tx_hash?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      holdings: {
        Row: {
          asset_id: string
          average_entry_price: number | null
          created_at: string
          id: string
          last_synced_block: number | null
          locked_quantity: number
          quantity: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          asset_id: string
          average_entry_price?: number | null
          created_at?: string
          id?: string
          last_synced_block?: number | null
          locked_quantity?: number
          quantity?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          asset_id?: string
          average_entry_price?: number | null
          created_at?: string
          id?: string
          last_synced_block?: number | null
          locked_quantity?: number
          quantity?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_business_dashboard"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "holdings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_marketplace"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_identities: {
        Row: {
          created_at: string
          external_id: string | null
          id: string
          provider: string
          raw_payload: Json | null
          reviewed_at: string | null
          status: Database["public"]["Enums"]["kyc_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          id?: string
          provider?: string
          raw_payload?: Json | null
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          external_id?: string | null
          id?: string
          provider?: string
          raw_payload?: Json | null
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_identities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          asset_id: string
          created_at: string
          currency: string
          id: string
          kind: Database["public"]["Enums"]["listing_kind"]
          lister_id: string
          original_quantity: number
          price_per_fraction: number
          quantity: number
          status: Database["public"]["Enums"]["listing_status"]
          tx_hash: string | null
          updated_at: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          currency?: string
          id?: string
          kind: Database["public"]["Enums"]["listing_kind"]
          lister_id: string
          original_quantity: number
          price_per_fraction: number
          quantity: number
          status?: Database["public"]["Enums"]["listing_status"]
          tx_hash?: string | null
          updated_at?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          currency?: string
          id?: string
          kind?: Database["public"]["Enums"]["listing_kind"]
          lister_id?: string
          original_quantity?: number
          price_per_fraction?: number
          quantity?: number
          status?: Database["public"]["Enums"]["listing_status"]
          tx_hash?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_business_dashboard"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "listings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_marketplace"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "listings_lister_id_fkey"
            columns: ["lister_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      onramp_sessions: {
        Row: {
          created_at: string
          fiat_amount: number | null
          fiat_currency: string | null
          id: string
          order_id: string | null
          provider: string
          provider_session_id: string | null
          raw_payload: Json | null
          status: Database["public"]["Enums"]["onramp_status"]
          token_amount: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fiat_amount?: number | null
          fiat_currency?: string | null
          id?: string
          order_id?: string | null
          provider: string
          provider_session_id?: string | null
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["onramp_status"]
          token_amount?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          fiat_amount?: number | null
          fiat_currency?: string | null
          id?: string
          order_id?: string | null
          provider?: string
          provider_session_id?: string | null
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["onramp_status"]
          token_amount?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onramp_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onramp_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          asset_id: string
          buyer_id: string
          created_at: string
          expires_at: string | null
          failure_reason: string | null
          fills: Json | null
          id: string
          payment_method: string | null
          platform_fee: number
          quantity: number
          quoted_total: number
          status: Database["public"]["Enums"]["order_status"]
          tx_hash: string | null
          updated_at: string | null
        }
        Insert: {
          asset_id: string
          buyer_id: string
          created_at?: string
          expires_at?: string | null
          failure_reason?: string | null
          fills?: Json | null
          id?: string
          payment_method?: string | null
          platform_fee: number
          quantity: number
          quoted_total: number
          status?: Database["public"]["Enums"]["order_status"]
          tx_hash?: string | null
          updated_at?: string | null
        }
        Update: {
          asset_id?: string
          buyer_id?: string
          created_at?: string
          expires_at?: string | null
          failure_reason?: string | null
          fills?: Json | null
          id?: string
          payment_method?: string | null
          platform_fee?: number
          quantity?: number
          quoted_total?: number
          status?: Database["public"]["Enums"]["order_status"]
          tx_hash?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_business_dashboard"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "orders_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_marketplace"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          asset_id: string | null
          block_number: number | null
          created_at: string
          fee: number | null
          fee_currency: string | null
          from_user_id: string | null
          from_wallet: string | null
          id: string
          listing_id: string | null
          log_index: number | null
          order_id: string | null
          price_per_fraction: number | null
          quantity: number | null
          to_user_id: string | null
          to_wallet: string | null
          total: number | null
          tx_hash: string | null
          type: Database["public"]["Enums"]["tx_type"]
          updated_at: string | null
        }
        Insert: {
          asset_id?: string | null
          block_number?: number | null
          created_at?: string
          fee?: number | null
          fee_currency?: string | null
          from_user_id?: string | null
          from_wallet?: string | null
          id?: string
          listing_id?: string | null
          log_index?: number | null
          order_id?: string | null
          price_per_fraction?: number | null
          quantity?: number | null
          to_user_id?: string | null
          to_wallet?: string | null
          total?: number | null
          tx_hash?: string | null
          type: Database["public"]["Enums"]["tx_type"]
          updated_at?: string | null
        }
        Update: {
          asset_id?: string | null
          block_number?: number | null
          created_at?: string
          fee?: number | null
          fee_currency?: string | null
          from_user_id?: string | null
          from_wallet?: string | null
          id?: string
          listing_id?: string | null
          log_index?: number | null
          order_id?: string | null
          price_per_fraction?: number | null
          quantity?: number | null
          to_user_id?: string | null
          to_wallet?: string | null
          total?: number | null
          tx_hash?: string | null
          type?: Database["public"]["Enums"]["tx_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_business_dashboard"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "transactions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_marketplace"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "transactions_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_verified: boolean
          last_login_at: string | null
          legal_name: string | null
          logo_url: string | null
          name: string | null
          phone: string | null
          settings: Json
          type: Database["public"]["Enums"]["user_type"]
          updated_at: string | null
          wallet_address: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_verified?: boolean
          last_login_at?: string | null
          legal_name?: string | null
          logo_url?: string | null
          name?: string | null
          phone?: string | null
          settings?: Json
          type: Database["public"]["Enums"]["user_type"]
          updated_at?: string | null
          wallet_address: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_verified?: boolean
          last_login_at?: string | null
          legal_name?: string | null
          logo_url?: string | null
          name?: string | null
          phone?: string | null
          settings?: Json
          type?: Database["public"]["Enums"]["user_type"]
          updated_at?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_business_dashboard: {
        Row: {
          asset_id: string | null
          asset_name: string | null
          available_supply: number | null
          business_id: string | null
          buyer_count: number | null
          created_at: string | null
          gross_revenue: number | null
          kyc_required: boolean | null
          last_sale_at: string | null
          mint_price_per_fraction: number | null
          nft_id: number | null
          primary_price: number | null
          primary_remaining: number | null
          status: Database["public"]["Enums"]["asset_status"] | null
          total_supply: number | null
          units_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_marketplace: {
        Row: {
          asset_id: string | null
          available_supply: number | null
          business_display_name: string | null
          business_id: string | null
          business_logo_url: string | null
          category_id: string | null
          category_name: string | null
          category_slug: string | null
          chain_id: number | null
          created_at: string | null
          description: string | null
          erc20_token_address: string | null
          floor_price_per_fraction: number | null
          is_purchasable: boolean | null
          kyc_required: boolean | null
          listed_quantity: number | null
          metadata: Json | null
          mint_price_per_fraction: number | null
          name: string | null
          nft_id: number | null
          status: Database["public"]["Enums"]["asset_status"] | null
          total_supply: number | null
          valuation: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_portfolio: {
        Row: {
          asset_id: string | null
          asset_name: string | null
          asset_status: Database["public"]["Enums"]["asset_status"] | null
          average_entry_price: number | null
          chain_id: number | null
          erc20_token_address: string | null
          holding_updated_at: string | null
          kyc_required: boolean | null
          locked_quantity: number | null
          metadata: Json | null
          nft_id: number | null
          open_listing_count: number | null
          open_listing_quantity: number | null
          quantity: number | null
          total_supply: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holdings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_business_dashboard"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "holdings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_marketplace"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      asset_status: "draft" | "minting" | "active" | "sold_out" | "delisted"
      kyc_status: "pending" | "approved" | "rejected" | "reset"
      listing_kind: "primary" | "secondary"
      listing_status: "active" | "filled" | "canceled"
      onramp_status: "created" | "pending" | "completed" | "failed" | "canceled"
      order_status:
        | "created"
        | "awaiting_funds"
        | "funded"
        | "submitted"
        | "settled"
        | "failed"
        | "expired"
      tx_type:
        | "mint"
        | "buy"
        | "sell_list"
        | "unlist"
        | "price_update"
        | "transfer"
        | "onramp"
      user_type: "retail" | "business"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      asset_status: ["draft", "minting", "active", "sold_out", "delisted"],
      kyc_status: ["pending", "approved", "rejected", "reset"],
      listing_kind: ["primary", "secondary"],
      listing_status: ["active", "filled", "canceled"],
      onramp_status: ["created", "pending", "completed", "failed", "canceled"],
      order_status: [
        "created",
        "awaiting_funds",
        "funded",
        "submitted",
        "settled",
        "failed",
        "expired",
      ],
      tx_type: [
        "mint",
        "buy",
        "sell_list",
        "unlist",
        "price_update",
        "transfer",
        "onramp",
      ],
      user_type: ["retail", "business"],
    },
  },
} as const
