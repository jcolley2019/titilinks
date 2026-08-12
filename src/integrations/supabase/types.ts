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
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_usage_events: {
        Row: {
          created_at: string
          fn: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fn: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fn?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      block_items: {
        Row: {
          badge: string | null
          bg_color: string | null
          block_id: string
          compare_at_price: number | null
          created_at: string
          cta_label: string | null
          currency: string | null
          id: string
          image_url: string | null
          is_adult: boolean | null
          label: string
          order_index: number
          price: number | null
          size: string | null
          style_json: Json | null
          subtitle: string | null
          title_color: string | null
          updated_at: string
          url: string
        }
        Insert: {
          badge?: string | null
          bg_color?: string | null
          block_id: string
          compare_at_price?: number | null
          created_at?: string
          cta_label?: string | null
          currency?: string | null
          id?: string
          image_url?: string | null
          is_adult?: boolean | null
          label: string
          order_index?: number
          price?: number | null
          size?: string | null
          style_json?: Json | null
          subtitle?: string | null
          title_color?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          badge?: string | null
          bg_color?: string | null
          block_id?: string
          compare_at_price?: number | null
          created_at?: string
          cta_label?: string | null
          currency?: string | null
          id?: string
          image_url?: string | null
          is_adult?: boolean | null
          label?: string
          order_index?: number
          price?: number | null
          size?: string | null
          style_json?: Json | null
          subtitle?: string | null
          title_color?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "block_items_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          mode_id: string
          order_index: number
          title: string | null
          type: Database["public"]["Enums"]["block_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          mode_id: string
          order_index?: number
          title?: string | null
          type: Database["public"]["Enums"]["block_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          mode_id?: string
          order_index?: number
          title?: string | null
          type?: Database["public"]["Enums"]["block_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_mode_id_fkey"
            columns: ["mode_id"]
            isOneToOne: false
            referencedRelation: "modes"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_short_links: {
        Row: {
          clicks: number
          created_at: string
          id: string
          slug: string
          target_url: string
          user_id: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          id?: string
          slug: string
          target_url: string
          user_id: string
        }
        Update: {
          clicks?: number
          created_at?: string
          id?: string
          slug?: string
          target_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_short_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_theme_presets: {
        Row: {
          created_at: string
          id: string
          name: string
          theme_json: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          theme_json: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          theme_json?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          metadata_json: Json | null
          mode: Database["public"]["Enums"]["mode_type"]
          page_id: string
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          metadata_json?: Json | null
          mode: Database["public"]["Enums"]["mode_type"]
          page_id: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          metadata_json?: Json | null
          mode?: Database["public"]["Enums"]["mode_type"]
          page_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      modes: {
        Row: {
          created_at: string
          id: string
          page_id: string
          sticky_cta_enabled: boolean
          type: Database["public"]["Enums"]["mode_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          page_id: string
          sticky_cta_enabled?: boolean
          type: Database["public"]["Enums"]["mode_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          page_id?: string
          sticky_cta_enabled?: boolean
          type?: Database["public"]["Enums"]["mode_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modes_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      page_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          page_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
          page_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          page_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_subscribers_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          avatar_original_url: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          goal_primary_offer_item_id: string | null
          goal_secondary_item_id: string | null
          handle: string
          id: string
          theme_json: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_original_url?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          goal_primary_offer_item_id?: string | null
          goal_secondary_item_id?: string | null
          handle: string
          id?: string
          theme_json?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_original_url?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          goal_primary_offer_item_id?: string | null
          goal_secondary_item_id?: string | null
          handle?: string
          id?: string
          theme_json?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pending_grants: {
        Row: {
          created_at: string
          first_paid_at: string
          grantable: boolean
          granted_at: string | null
          id: string
          qualify_at: string
          referred_coupon_id: string | null
          referred_id: string
          referrer_coupon_id: string | null
          referrer_id: string
          status: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          created_at?: string
          first_paid_at: string
          grantable?: boolean
          granted_at?: string | null
          id?: string
          qualify_at: string
          referred_coupon_id?: string | null
          referred_id: string
          referrer_coupon_id?: string | null
          referrer_id: string
          status?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          created_at?: string
          first_paid_at?: string
          grantable?: boolean
          granted_at?: string | null
          id?: string
          qualify_at?: string
          referred_coupon_id?: string | null
          referred_id?: string
          referrer_coupon_id?: string | null
          referrer_id?: string
          status?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_grants_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_grants_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_snapshots: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          page_id: string
          payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          page_id: string
          payload: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          page_id?: string
          payload?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_snapshots_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          brand_json: Json | null
          created_at: string
          display_name: string | null
          email: string
          ga4_id: string | null
          id: string
          meta_pixel_id: string | null
          onboarding_complete: boolean | null
          page_style: string | null
          plan: string
          referral_code: string | null
          referred_by: string | null
          show_badge: boolean
          stripe_customer_id: string | null
          subscription_period_end: string | null
          subscription_status: string | null
          tiktok_pixel_id: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          brand_json?: Json | null
          created_at?: string
          display_name?: string | null
          email: string
          ga4_id?: string | null
          id: string
          meta_pixel_id?: string | null
          onboarding_complete?: boolean | null
          page_style?: string | null
          plan?: string
          referral_code?: string | null
          referred_by?: string | null
          show_badge?: boolean
          stripe_customer_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string | null
          tiktok_pixel_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          brand_json?: Json | null
          created_at?: string
          display_name?: string | null
          email?: string
          ga4_id?: string | null
          id?: string
          meta_pixel_id?: string | null
          onboarding_complete?: boolean | null
          page_style?: string | null
          plan?: string
          referral_code?: string | null
          referred_by?: string | null
          show_badge?: boolean
          stripe_customer_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string | null
          tiktok_pixel_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          error: string | null
          id: string
          processed_at: string | null
          received_at: string
          type: string
        }
        Insert: {
          error?: string | null
          id: string
          processed_at?: string | null
          received_at?: string
          type: string
        }
        Update: {
          error?: string | null
          id?: string
          processed_at?: string | null
          received_at?: string
          type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_referral: { Args: { p_code: string }; Returns: boolean }
      current_plan: { Args: never; Returns: string }
      generate_referral_code: { Args: never; Returns: string }
      get_block_owner: { Args: { block_id: string }; Returns: string }
      get_mode_owner: { Args: { mode_id: string }; Returns: string }
      get_page_owner: { Args: { page_id: string }; Returns: string }
      get_public_brand_fonts: { Args: { page_handle: string }; Returns: Json }
      get_public_page_branding: {
        Args: { p_page_id: string }
        Returns: {
          plan: string
          referral_code: string
          show_badge: boolean
        }[]
      }
      get_public_page_plan: { Args: { p_page_id: string }; Returns: string }
      get_public_tracking_pixels: {
        Args: { page_handle: string }
        Returns: {
          ga4_id: string
          meta_pixel_id: string
          tiktok_pixel_id: string
        }[]
      }
      plan_allows: {
        Args: { p_feature: string; p_plan: string }
        Returns: boolean
      }
      plan_limit: { Args: { p_limit: string; p_plan: string }; Returns: number }
      referral_earned_in_window: {
        Args: { p_referrer: string }
        Returns: number
      }
      resolve_short_link_by_slug: { Args: { p_slug: string }; Returns: string }
      subscribe_to_page: {
        Args: { p_email: string; p_name?: string; p_page_id: string }
        Returns: Json
      }
    }
    Enums: {
      block_type:
        | "primary_cta"
        | "links"
        | "social_links"
        | "product_cards"
        | "featured_media"
        | "hero_card"
        | "social_icon_row"
        | "email_subscribe"
        | "content_section"
        | "gallery"
        | "bio"
        | "video_feed"
        | "text"
        | "carousel"
      event_type: "page_view" | "outbound_click" | "mode_routed"
      mode_type: "page1" | "page2"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      block_type: [
        "primary_cta",
        "links",
        "social_links",
        "product_cards",
        "featured_media",
        "hero_card",
        "social_icon_row",
        "email_subscribe",
        "content_section",
        "gallery",
        "bio",
        "video_feed",
        "text",
        "carousel",
      ],
      event_type: ["page_view", "outbound_click", "mode_routed"],
      mode_type: ["page1", "page2"],
    },
  },
} as const
