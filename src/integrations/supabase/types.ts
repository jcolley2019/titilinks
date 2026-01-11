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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      block_items: {
        Row: {
          badge: string | null
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
          subtitle: string | null
          updated_at: string
          url: string
        }
        Insert: {
          badge?: string | null
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
          subtitle?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          badge?: string | null
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
          subtitle?: string | null
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
      canva_connections: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          scope: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          goal_primary_offer_item_id: string | null
          goal_recruit_item_id: string | null
          handle: string
          id: string
          theme_json: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          goal_primary_offer_item_id?: string | null
          goal_recruit_item_id?: string | null
          handle: string
          id?: string
          theme_json?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          goal_primary_offer_item_id?: string | null
          goal_recruit_item_id?: string | null
          handle?: string
          id?: string
          theme_json?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_goal_primary_offer"
            columns: ["goal_primary_offer_item_id"]
            isOneToOne: false
            referencedRelation: "block_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_goal_recruit"
            columns: ["goal_recruit_item_id"]
            isOneToOne: false
            referencedRelation: "block_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_canva_auth: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          id: string
          redirect_origin: string | null
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at?: string
          id?: string
          redirect_origin?: string | null
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          id?: string
          redirect_origin?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      short_links: {
        Row: {
          block_item_id: string | null
          click_count: number | null
          code: string
          created_at: string
          destination_url: string
          id: string
          last_clicked_at: string | null
          page_id: string
          updated_at: string
        }
        Insert: {
          block_item_id?: string | null
          click_count?: number | null
          code: string
          created_at?: string
          destination_url: string
          id?: string
          last_clicked_at?: string | null
          page_id: string
          updated_at?: string
        }
        Update: {
          block_item_id?: string | null
          click_count?: number | null
          code?: string
          created_at?: string
          destination_url?: string
          id?: string
          last_clicked_at?: string | null
          page_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "short_links_block_item_id_fkey"
            columns: ["block_item_id"]
            isOneToOne: false
            referencedRelation: "block_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "short_links_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_block_owner: { Args: { block_id: string }; Returns: string }
      get_mode_owner: { Args: { mode_id: string }; Returns: string }
      get_page_owner: { Args: { page_id: string }; Returns: string }
      resolve_short_link: {
        Args: { p_code: string; p_referrer?: string; p_user_agent?: string }
        Returns: {
          destination_url: string
        }[]
      }
      subscribe_to_page: {
        Args: { p_email: string; p_name?: string; p_page_id: string }
        Returns: Json
      }
    }
    Enums: {
      block_type:
        | "primary_cta"
        | "product_cards"
        | "featured_media"
        | "social_links"
        | "links"
        | "hero_card"
        | "social_icon_row"
        | "email_subscribe"
        | "content_section"
        | "product_catalog"
      event_type: "page_view" | "outbound_click" | "mode_routed"
      mode_type: "shop" | "recruit"
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
      block_type: [
        "primary_cta",
        "product_cards",
        "featured_media",
        "social_links",
        "links",
        "hero_card",
        "social_icon_row",
        "email_subscribe",
        "content_section",
        "product_catalog",
      ],
      event_type: ["page_view", "outbound_click", "mode_routed"],
      mode_type: ["shop", "recruit"],
    },
  },
} as const
