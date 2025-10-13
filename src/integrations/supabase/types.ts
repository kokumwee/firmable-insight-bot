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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      chat_logs: {
        Row: {
          citations: Json | null
          guardrail: string | null
          id: string
          role: string
          text: string
          ts: string | null
          url: string
        }
        Insert: {
          citations?: Json | null
          guardrail?: string | null
          id?: string
          role: string
          text: string
          ts?: string | null
          url: string
        }
        Update: {
          citations?: Json | null
          guardrail?: string | null
          id?: string
          role?: string
          text?: string
          ts?: string | null
          url?: string
        }
        Relationships: []
      }
      chunks: {
        Row: {
          chunk_id: string
          created_at: string | null
          id: string
          page_id: string | null
          page_type: string | null
          path: string | null
          source_url: string | null
          text: string
          text_offset: number
          url: string
        }
        Insert: {
          chunk_id: string
          created_at?: string | null
          id?: string
          page_id?: string | null
          page_type?: string | null
          path?: string | null
          source_url?: string | null
          text: string
          text_offset: number
          url: string
        }
        Update: {
          chunk_id?: string
          created_at?: string | null
          id?: string
          page_id?: string | null
          page_type?: string | null
          path?: string | null
          source_url?: string | null
          text?: string
          text_offset?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "chunks_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      company_cards: {
        Row: {
          analysis_json: Json | null
          analyzed_at: string | null
          company_size: Json | null
          contacts: Json | null
          hq_location: Json | null
          industry: Json | null
          name: string | null
          offerings: Json | null
          resolvers: Json | null
          target_audience: Json | null
          url: string
          url_key: string | null
          usp: Json | null
        }
        Insert: {
          analysis_json?: Json | null
          analyzed_at?: string | null
          company_size?: Json | null
          contacts?: Json | null
          hq_location?: Json | null
          industry?: Json | null
          name?: string | null
          offerings?: Json | null
          resolvers?: Json | null
          target_audience?: Json | null
          url: string
          url_key?: string | null
          usp?: Json | null
        }
        Update: {
          analysis_json?: Json | null
          analyzed_at?: string | null
          company_size?: Json | null
          contacts?: Json | null
          hq_location?: Json | null
          industry?: Json | null
          name?: string | null
          offerings?: Json | null
          resolvers?: Json | null
          target_audience?: Json | null
          url?: string
          url_key?: string | null
          usp?: Json | null
        }
        Relationships: []
      }
      company_news: {
        Row: {
          cluster_id: string | null
          created_at: string | null
          deleted: boolean | null
          id: string
          link: string | null
          published_at: string
          quote: string | null
          reason: string | null
          relevance: number
          source: string
          sources: Json | null
          summary: string
          title: string
          url: string
          url_key: string | null
        }
        Insert: {
          cluster_id?: string | null
          created_at?: string | null
          deleted?: boolean | null
          id?: string
          link?: string | null
          published_at: string
          quote?: string | null
          reason?: string | null
          relevance?: number
          source: string
          sources?: Json | null
          summary: string
          title: string
          url: string
          url_key?: string | null
        }
        Update: {
          cluster_id?: string | null
          created_at?: string | null
          deleted?: boolean | null
          id?: string
          link?: string | null
          published_at?: string
          quote?: string | null
          reason?: string | null
          relevance?: number
          source?: string
          sources?: Json | null
          summary?: string
          title?: string
          url?: string
          url_key?: string | null
        }
        Relationships: []
      }
      company_news_debug: {
        Row: {
          created_at: string
          dropped_reason: string | null
          id: string
          link: string | null
          parsed_ok: boolean | null
          published_at_raw: string | null
          publisher: string | null
          stage: string
          title: string | null
          url_key: string
        }
        Insert: {
          created_at?: string
          dropped_reason?: string | null
          id?: string
          link?: string | null
          parsed_ok?: boolean | null
          published_at_raw?: string | null
          publisher?: string | null
          stage: string
          title?: string | null
          url_key: string
        }
        Update: {
          created_at?: string
          dropped_reason?: string | null
          id?: string
          link?: string | null
          parsed_ok?: boolean | null
          published_at_raw?: string | null
          publisher?: string | null
          stage?: string
          title?: string | null
          url_key?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          company_size: Json | null
          created_at: string | null
          hq_location: Json | null
          id: string
          industry: Json | null
          keywords_top: Json | null
          last_contacted_at: string | null
          linkedin_summary: string | null
          name: string
          notes: string | null
          offerings_bulleted: Json | null
          recently_updated: boolean | null
          tags: string[] | null
          target_audience_list: Json | null
          tone_summary: string | null
          updated_at: string | null
          url: string | null
          url_key: string | null
          usp: Json | null
        }
        Insert: {
          company_size?: Json | null
          created_at?: string | null
          hq_location?: Json | null
          id?: string
          industry?: Json | null
          keywords_top?: Json | null
          last_contacted_at?: string | null
          linkedin_summary?: string | null
          name: string
          notes?: string | null
          offerings_bulleted?: Json | null
          recently_updated?: boolean | null
          tags?: string[] | null
          target_audience_list?: Json | null
          tone_summary?: string | null
          updated_at?: string | null
          url?: string | null
          url_key?: string | null
          usp?: Json | null
        }
        Update: {
          company_size?: Json | null
          created_at?: string | null
          hq_location?: Json | null
          id?: string
          industry?: Json | null
          keywords_top?: Json | null
          last_contacted_at?: string | null
          linkedin_summary?: string | null
          name?: string
          notes?: string | null
          offerings_bulleted?: Json | null
          recently_updated?: boolean | null
          tags?: string[] | null
          target_audience_list?: Json | null
          tone_summary?: string | null
          updated_at?: string | null
          url?: string | null
          url_key?: string | null
          usp?: Json | null
        }
        Relationships: []
      }
      engagement_insights: {
        Row: {
          brand_voice: Json | null
          created_at: string | null
          key_messages: Json | null
          outreach_guidance: Json | null
          url: string
        }
        Insert: {
          brand_voice?: Json | null
          created_at?: string | null
          key_messages?: Json | null
          outreach_guidance?: Json | null
          url: string
        }
        Update: {
          brand_voice?: Json | null
          created_at?: string | null
          key_messages?: Json | null
          outreach_guidance?: Json | null
          url?: string
        }
        Relationships: []
      }
      market_neighbors: {
        Row: {
          created_at: string | null
          neighbors: Json
          url: string
        }
        Insert: {
          created_at?: string | null
          neighbors?: Json
          url: string
        }
        Update: {
          created_at?: string | null
          neighbors?: Json
          url?: string
        }
        Relationships: []
      }
      my_company_profile: {
        Row: {
          description: string | null
          id: string
          industry: string | null
          keywords: string[] | null
          name: string | null
          target_audience: string | null
          tone: string | null
          updated_at: string
          value_proposition: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          industry?: string | null
          keywords?: string[] | null
          name?: string | null
          target_audience?: string | null
          tone?: string | null
          updated_at?: string
          value_proposition?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          industry?: string | null
          keywords?: string[] | null
          name?: string | null
          target_audience?: string | null
          tone?: string | null
          updated_at?: string
          value_proposition?: string | null
        }
        Relationships: []
      }
      outreach_tasks: {
        Row: {
          created_at: string | null
          customer_id: string
          id: string
          news_cluster_ids: string[] | null
          priority: number | null
          reason: string
          reason_code: string | null
          recommended_at: string
          snooze_until: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          id?: string
          news_cluster_ids?: string[] | null
          priority?: number | null
          reason: string
          reason_code?: string | null
          recommended_at?: string
          snooze_until?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          id?: string
          news_cluster_ids?: string[] | null
          priority?: number | null
          reason?: string
          reason_code?: string | null
          recommended_at?: string
          snooze_until?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      page_cache: {
        Row: {
          diagnostic: Json | null
          fetched_at: string
          html: string
          status: number
          url: string
        }
        Insert: {
          diagnostic?: Json | null
          fetched_at?: string
          html: string
          status: number
          url: string
        }
        Update: {
          diagnostic?: Json | null
          fetched_at?: string
          html?: string
          status?: number
          url?: string
        }
        Relationships: []
      }
      pages: {
        Row: {
          blocked: boolean | null
          content_hash: string | null
          content_len: number | null
          fetched_at: string | null
          id: string
          jsonld: Json | null
          meta: Json | null
          origin: string
          page_type: string
          path: string
          reason: string | null
          status_code: number | null
          url: string
        }
        Insert: {
          blocked?: boolean | null
          content_hash?: string | null
          content_len?: number | null
          fetched_at?: string | null
          id?: string
          jsonld?: Json | null
          meta?: Json | null
          origin: string
          page_type: string
          path: string
          reason?: string | null
          status_code?: number | null
          url: string
        }
        Update: {
          blocked?: boolean | null
          content_hash?: string | null
          content_len?: number | null
          fetched_at?: string | null
          id?: string
          jsonld?: Json | null
          meta?: Json | null
          origin?: string
          page_type?: string
          path?: string
          reason?: string | null
          status_code?: number | null
          url?: string
        }
        Relationships: []
      }
      shortlist: {
        Row: {
          analyzed_at: string | null
          avg_confidence: string | null
          company_size: Json | null
          contacts: Json | null
          created_at: string | null
          hq_location: Json | null
          icp_fit: string | null
          id: string
          industry: Json | null
          keywords_top: Json | null
          name: string | null
          notes: string | null
          offerings_bulleted: Json | null
          tags: string[] | null
          target_audience_list: Json | null
          tone_summary: string | null
          updated_at: string | null
          url: string
          usp: Json | null
        }
        Insert: {
          analyzed_at?: string | null
          avg_confidence?: string | null
          company_size?: Json | null
          contacts?: Json | null
          created_at?: string | null
          hq_location?: Json | null
          icp_fit?: string | null
          id?: string
          industry?: Json | null
          keywords_top?: Json | null
          name?: string | null
          notes?: string | null
          offerings_bulleted?: Json | null
          tags?: string[] | null
          target_audience_list?: Json | null
          tone_summary?: string | null
          updated_at?: string | null
          url: string
          usp?: Json | null
        }
        Update: {
          analyzed_at?: string | null
          avg_confidence?: string | null
          company_size?: Json | null
          contacts?: Json | null
          created_at?: string | null
          hq_location?: Json | null
          icp_fit?: string | null
          id?: string
          industry?: Json | null
          keywords_top?: Json | null
          name?: string | null
          notes?: string | null
          offerings_bulleted?: Json | null
          tags?: string[] | null
          target_audience_list?: Json | null
          tone_summary?: string | null
          updated_at?: string | null
          url?: string
          usp?: Json | null
        }
        Relationships: []
      }
      shortlist_history: {
        Row: {
          created_at: string | null
          id: string
          shortlist_url: string
          snapshot: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          shortlist_url: string
          snapshot: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          shortlist_url?: string
          snapshot?: Json
        }
        Relationships: []
      }
      unverified_suggestions: {
        Row: {
          confidence: string
          created_at: string
          field: string
          id: string
          rationale: string
          suggestion: string
          url: string
        }
        Insert: {
          confidence: string
          created_at?: string
          field: string
          id?: string
          rationale: string
          suggestion: string
          url: string
        }
        Update: {
          confidence?: string
          created_at?: string
          field?: string
          id?: string
          rationale?: string
          suggestion?: string
          url?: string
        }
        Relationships: []
      }
      user_icp: {
        Row: {
          icp_json: Json
          id: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          icp_json: Json
          id?: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          icp_json?: Json
          id?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_news_debug: {
        Args: Record<PropertyKey, never>
        Returns: undefined
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
