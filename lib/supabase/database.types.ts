export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      card_comments: {
        Row: {
          author_id: string
          card_id: string
          created_at: string
          id: string
          text: string
        }
        Insert: {
          author_id: string
          card_id: string
          created_at?: string
          id?: string
          text: string
        }
        Update: {
          author_id?: string
          card_id?: string
          created_at?: string
          id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_comments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "content_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      client_access: {
        Row: {
          canva_link: string | null
          client_id: string
          drive_link: string | null
          facebook_login: string | null
          facebook_password: string | null
          id: string
          instagram_login: string | null
          instagram_password: string | null
          linkedin_login: string | null
          linkedin_password: string | null
          mlabs_login: string | null
          mlabs_password: string | null
          other_notes: string | null
          tiktok_login: string | null
          tiktok_password: string | null
          updated_at: string
          updated_by: string | null
          youtube_login: string | null
          youtube_password: string | null
        }
        Insert: {
          canva_link?: string | null
          client_id: string
          drive_link?: string | null
          facebook_login?: string | null
          facebook_password?: string | null
          id?: string
          instagram_login?: string | null
          instagram_password?: string | null
          linkedin_login?: string | null
          linkedin_password?: string | null
          mlabs_login?: string | null
          mlabs_password?: string | null
          other_notes?: string | null
          tiktok_login?: string | null
          tiktok_password?: string | null
          updated_at?: string
          updated_by?: string | null
          youtube_login?: string | null
          youtube_password?: string | null
        }
        Update: {
          canva_link?: string | null
          client_id?: string
          drive_link?: string | null
          facebook_login?: string | null
          facebook_password?: string | null
          id?: string
          instagram_login?: string | null
          instagram_password?: string | null
          linkedin_login?: string | null
          linkedin_password?: string | null
          mlabs_login?: string | null
          mlabs_password?: string | null
          other_notes?: string | null
          tiktok_login?: string | null
          tiktok_password?: string | null
          updated_at?: string
          updated_by?: string | null
          youtube_login?: string | null
          youtube_password?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_access_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      client_chat_messages: {
        Row: {
          client_id: string
          created_at: string
          id: string
          text: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          text: string
          user_id?: string | null
          user_name?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          text?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_chat_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          assigned_social_id: string | null
          assigned_traffic_id: string | null
          attention_level: Database["public"]["Enums"]["attention_level"]
          campaign_briefing: string | null
          contract_end: string | null
          created_at: string
          crisis_note: string | null
          drive_link: string | null
          fixed_briefing: string | null
          id: string
          industry: string
          instagram_user: string | null
          join_date: string
          last_kanban_activity: string | null
          last_post_date: string | null
          logo: string | null
          monthly_budget: number
          name: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          posts_goal: number
          posts_this_month: number
          status: Database["public"]["Enums"]["client_status"]
          tags: string[]
          tone_of_voice: Database["public"]["Enums"]["tone_of_voice"] | null
          updated_at: string
        }
        Insert: {
          assigned_social_id?: string | null
          assigned_traffic_id?: string | null
          attention_level?: Database["public"]["Enums"]["attention_level"]
          campaign_briefing?: string | null
          contract_end?: string | null
          created_at?: string
          crisis_note?: string | null
          drive_link?: string | null
          fixed_briefing?: string | null
          id?: string
          industry: string
          instagram_user?: string | null
          join_date?: string
          last_kanban_activity?: string | null
          last_post_date?: string | null
          logo?: string | null
          monthly_budget?: number
          name: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          posts_goal?: number
          posts_this_month?: number
          status?: Database["public"]["Enums"]["client_status"]
          tags?: string[]
          tone_of_voice?: Database["public"]["Enums"]["tone_of_voice"] | null
          updated_at?: string
        }
        Update: {
          assigned_social_id?: string | null
          assigned_traffic_id?: string | null
          attention_level?: Database["public"]["Enums"]["attention_level"]
          campaign_briefing?: string | null
          contract_end?: string | null
          created_at?: string
          crisis_note?: string | null
          drive_link?: string | null
          fixed_briefing?: string | null
          id?: string
          industry?: string
          instagram_user?: string | null
          join_date?: string
          last_kanban_activity?: string | null
          last_post_date?: string | null
          logo?: string | null
          monthly_budget?: number
          name?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          posts_goal?: number
          posts_this_month?: number
          status?: Database["public"]["Enums"]["client_status"]
          tags?: string[]
          tone_of_voice?: Database["public"]["Enums"]["tone_of_voice"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_assigned_social_id_fkey"
            columns: ["assigned_social_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_assigned_traffic_id_fkey"
            columns: ["assigned_traffic_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      content_approvals: {
        Row: {
          card_id: string
          created_at: string
          id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Relationships: [
          {
            foreignKeyName: "content_approvals_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "content_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_approvals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      content_cards: {
        Row: {
          briefing: string | null
          caption: string | null
          client_id: string
          created_at: string
          design_request_id: string | null
          designer_delivered_at: string | null
          designer_delivered_by: string | null
          due_date: string | null
          due_time: string | null
          format: string
          hashtags: string | null
          id: string
          image_url: string | null
          non_delivery_reason: string | null
          non_delivery_reported_at: string | null
          non_delivery_reported_by: string | null
          observations: string | null
          platform: Database["public"]["Enums"]["social_platform"] | null
          priority: Database["public"]["Enums"]["priority_type"]
          social_confirmed_at: string | null
          social_confirmed_by: string | null
          social_media_id: string | null
          status: Database["public"]["Enums"]["content_status"]
          status_changed_at: string | null
          title: string
          traffic_suggestion: string | null
          updated_at: string
        }
        Insert: {
          briefing?: string | null
          caption?: string | null
          client_id: string
          created_at?: string
          design_request_id?: string | null
          designer_delivered_at?: string | null
          designer_delivered_by?: string | null
          due_date?: string | null
          due_time?: string | null
          format?: string
          hashtags?: string | null
          id?: string
          image_url?: string | null
          non_delivery_reason?: string | null
          non_delivery_reported_at?: string | null
          non_delivery_reported_by?: string | null
          observations?: string | null
          platform?: Database["public"]["Enums"]["social_platform"] | null
          priority?: Database["public"]["Enums"]["priority_type"]
          social_confirmed_at?: string | null
          social_confirmed_by?: string | null
          social_media_id?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          status_changed_at?: string | null
          title: string
          traffic_suggestion?: string | null
          updated_at?: string
        }
        Update: {
          briefing?: string | null
          caption?: string | null
          client_id?: string
          created_at?: string
          design_request_id?: string | null
          designer_delivered_at?: string | null
          designer_delivered_by?: string | null
          due_date?: string | null
          due_time?: string | null
          format?: string
          hashtags?: string | null
          id?: string
          image_url?: string | null
          non_delivery_reason?: string | null
          non_delivery_reported_at?: string | null
          non_delivery_reported_by?: string | null
          observations?: string | null
          platform?: Database["public"]["Enums"]["social_platform"] | null
          priority?: Database["public"]["Enums"]["priority_type"]
          social_confirmed_at?: string | null
          social_confirmed_by?: string | null
          social_media_id?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          status_changed_at?: string | null
          title?: string
          traffic_suggestion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_cards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_cards_designer_delivered_by_fkey"
            columns: ["designer_delivered_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_cards_non_delivery_reported_by_fkey"
            columns: ["non_delivery_reported_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_cards_social_confirmed_by_fkey"
            columns: ["social_confirmed_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_cards_social_media_id_fkey"
            columns: ["social_media_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_content_cards_design_request"
            columns: ["design_request_id"]
            isOneToOne: false
            referencedRelation: "design_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_assets: {
        Row: {
          client_id: string
          id: string
          label: string | null
          type: Database["public"]["Enums"]["creative_asset_type"]
          uploaded_at: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          client_id: string
          id?: string
          label?: string | null
          type: Database["public"]["Enums"]["creative_asset_type"]
          uploaded_at?: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          client_id?: string
          id?: string
          label?: string | null
          type?: Database["public"]["Enums"]["creative_asset_type"]
          uploaded_at?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      crisis_notes: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "crisis_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crisis_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      design_requests: {
        Row: {
          attachments: string[]
          briefing: string
          client_id: string
          created_at: string
          deadline: string | null
          format: string
          id: string
          priority: Database["public"]["Enums"]["priority_type"]
          requested_by: string
          status: Database["public"]["Enums"]["design_status"]
          title: string
          updated_at: string
        }
        Insert: {
          attachments?: string[]
          briefing?: string
          client_id: string
          created_at?: string
          deadline?: string | null
          format?: string
          id?: string
          priority?: Database["public"]["Enums"]["priority_type"]
          requested_by: string
          status?: Database["public"]["Enums"]["design_status"]
          title: string
          updated_at?: string
        }
        Update: {
          attachments?: string[]
          briefing?: string
          client_id?: string
          created_at?: string
          deadline?: string | null
          format?: string
          id?: string
          priority?: Database["public"]["Enums"]["priority_type"]
          requested_by?: string
          status?: Database["public"]["Enums"]["design_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      global_chat_messages: {
        Row: {
          created_at: string
          id: string
          text: string
          user_id: string | null
          user_name: string
          user_role: Database["public"]["Enums"]["role_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          text: string
          user_id?: string | null
          user_name?: string
          user_role: Database["public"]["Enums"]["role_type"]
        }
        Update: {
          created_at?: string
          id?: string
          text?: string
          user_id?: string | null
          user_name?: string
          user_role?: Database["public"]["Enums"]["role_type"]
        }
        Relationships: [
          {
            foreignKeyName: "global_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_entries: {
        Row: {
          client_id: string
          id: string
          mood: Database["public"]["Enums"]["mood_type"]
          note: string | null
          recorded_at: string
          recorded_by: string | null
        }
        Insert: {
          client_id: string
          id?: string
          mood: Database["public"]["Enums"]["mood_type"]
          note?: string | null
          recorded_at?: string
          recorded_by?: string | null
        }
        Update: {
          client_id?: string
          id?: string
          mood?: Database["public"]["Enums"]["mood_type"]
          note?: string | null
          recorded_at?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mood_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mood_entries_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      notices: {
        Row: {
          body: string
          category: Database["public"]["Enums"]["notice_category"]
          created_at: string
          created_by: string
          id: string
          scheduled_at: string | null
          title: string
          urgent: boolean
        }
        Insert: {
          body: string
          category?: Database["public"]["Enums"]["notice_category"]
          created_at?: string
          created_by: string
          id?: string
          scheduled_at?: string | null
          title: string
          urgent?: boolean
        }
        Update: {
          body?: string
          category?: Database["public"]["Enums"]["notice_category"]
          created_at?: string
          created_by?: string
          id?: string
          scheduled_at?: string | null
          title?: string
          urgent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          client_id: string | null
          created_at: string
          id: string
          read: boolean
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string | null
        }
        Insert: {
          body: string
          client_id?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id?: string | null
        }
        Update: {
          body?: string
          client_id?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_items: {
        Row: {
          client_id: string
          completed: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          client_id: string
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          client_id?: string
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      quinz_reports: {
        Row: {
          challenges: string
          client_engagement: number
          client_id: string
          communication_health: number
          created_at: string
          created_by: string
          highlights: string
          id: string
          next_steps: string
          period: string
        }
        Insert: {
          challenges?: string
          client_engagement: number
          client_id: string
          communication_health: number
          created_at?: string
          created_by: string
          highlights?: string
          id?: string
          next_steps?: string
          period: string
        }
        Update: {
          challenges?: string
          client_engagement?: number
          client_id?: string
          communication_health?: number
          created_at?: string
          created_by?: string
          highlights?: string
          id?: string
          next_steps?: string
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "quinz_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quinz_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      social_monthly_reports: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          engagement: number
          engagement_rate: number
          followers_gained: number
          followers_lost: number
          id: string
          impressions: number
          month: string
          observations: string | null
          posts_goal: number
          posts_published: number
          reach: number
          reels_count: number
          stories_count: number
          top_post: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          engagement?: number
          engagement_rate?: number
          followers_gained?: number
          followers_lost?: number
          id?: string
          impressions?: number
          month: string
          observations?: string | null
          posts_goal?: number
          posts_published?: number
          reach?: number
          reels_count?: number
          stories_count?: number
          top_post?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          engagement?: number
          engagement_rate?: number
          followers_gained?: number
          followers_lost?: number
          id?: string
          impressions?: number
          month?: string
          observations?: string | null
          posts_goal?: number
          posts_published?: number
          reach?: number
          reels_count?: number
          stories_count?: number
          top_post?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_monthly_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_monthly_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      social_proof_entries: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          metric1_label: string
          metric1_value: string
          metric2_label: string
          metric2_value: string
          metric3_label: string
          metric3_value: string
          period: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          metric1_label?: string
          metric1_value?: string
          metric2_label?: string
          metric2_value?: string
          metric3_label?: string
          metric3_value?: string
          period?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metric1_label?: string
          metric1_value?: string
          metric2_label?: string
          metric2_value?: string
          metric3_label?: string
          metric3_value?: string
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_proof_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_proof_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          attachments: string[]
          client_id: string
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["priority_type"]
          role: Database["public"]["Enums"]["role_type"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          attachments?: string[]
          client_id: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["priority_type"]
          role: Database["public"]["Enums"]["role_type"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          attachments?: string[]
          client_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["priority_type"]
          role?: Database["public"]["Enums"]["role_type"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          password_hash: string | null
          role: Database["public"]["Enums"]["role_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          password_hash?: string | null
          role: Database["public"]["Enums"]["role_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          password_hash?: string | null
          role?: Database["public"]["Enums"]["role_type"]
          updated_at?: string
        }
        Relationships: []
      }
      timeline_entries: {
        Row: {
          actor_id: string | null
          actor_name: string
          client_id: string
          created_at: string
          description: string
          id: string
          type: Database["public"]["Enums"]["timeline_entry_type"]
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string
          client_id: string
          created_at?: string
          description: string
          id?: string
          type: Database["public"]["Enums"]["timeline_entry_type"]
        }
        Update: {
          actor_id?: string | null
          actor_name?: string
          client_id?: string
          created_at?: string
          description?: string
          id?: string
          type?: Database["public"]["Enums"]["timeline_entry_type"]
        }
        Relationships: [
          {
            foreignKeyName: "timeline_entries_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_monthly_reports: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          impressions: number
          message_cost: number
          messages: number
          month: string
          observations: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          impressions?: number
          message_cost?: number
          messages?: number
          month: string
          observations?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          impressions?: number
          message_cost?: number
          messages?: number
          month?: string
          observations?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traffic_monthly_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traffic_monthly_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_routine_checks: {
        Row: {
          client_id: string
          completed_at: string
          completed_by: string | null
          date: string
          id: string
          note: string | null
          type: Database["public"]["Enums"]["routine_check_type"]
        }
        Insert: {
          client_id: string
          completed_at?: string
          completed_by?: string | null
          date: string
          id?: string
          note?: string | null
          type: Database["public"]["Enums"]["routine_check_type"]
        }
        Update: {
          client_id?: string
          completed_at?: string
          completed_by?: string | null
          date?: string
          id?: string
          note?: string | null
          type?: Database["public"]["Enums"]["routine_check_type"]
        }
        Relationships: [
          {
            foreignKeyName: "traffic_routine_checks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traffic_routine_checks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "team_members"
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
      approval_status: "pending" | "approved" | "rejected"
      attention_level: "low" | "medium" | "high" | "critical"
      client_status: "onboarding" | "good" | "average" | "at_risk"
      content_status:
        | "ideas"
        | "script"
        | "in_production"
        | "approval"
        | "client_approval"
        | "scheduled"
        | "published"
      creative_asset_type: "reference" | "palette" | "typography" | "logo"
      design_status: "queued" | "in_progress" | "done"
      mood_type: "happy" | "neutral" | "angry"
      notice_category: "general" | "meeting" | "deadline" | "reminder"
      notification_type: "sla" | "status" | "content" | "checkin" | "system"
      payment_method: "pix" | "boleto" | "cartao" | "transferencia"
      priority_type: "low" | "medium" | "high" | "critical"
      role_type: "admin" | "manager" | "traffic" | "social" | "designer"
      routine_check_type: "support" | "report" | "feedback" | "analysis"
      social_platform:
        | "instagram"
        | "tiktok"
        | "linkedin"
        | "youtube"
        | "facebook"
      task_status: "pending" | "in_progress" | "review" | "done"
      timeline_entry_type:
        | "chat"
        | "task"
        | "status"
        | "content"
        | "design"
        | "report"
        | "manual"
        | "onboarding"
        | "meeting"
      tone_of_voice: "formal" | "funny" | "authoritative" | "casual"
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
      approval_status: ["pending", "approved", "rejected"],
      attention_level: ["low", "medium", "high", "critical"],
      client_status: ["onboarding", "good", "average", "at_risk"],
      content_status: [
        "ideas",
        "script",
        "in_production",
        "approval",
        "client_approval",
        "scheduled",
        "published",
      ],
      creative_asset_type: ["reference", "palette", "typography", "logo"],
      design_status: ["queued", "in_progress", "done"],
      mood_type: ["happy", "neutral", "angry"],
      notice_category: ["general", "meeting", "deadline", "reminder"],
      notification_type: ["sla", "status", "content", "checkin", "system"],
      payment_method: ["pix", "boleto", "cartao", "transferencia"],
      priority_type: ["low", "medium", "high", "critical"],
      role_type: ["admin", "manager", "traffic", "social", "designer"],
      routine_check_type: ["support", "report", "feedback", "analysis"],
      social_platform: [
        "instagram",
        "tiktok",
        "linkedin",
        "youtube",
        "facebook",
      ],
      task_status: ["pending", "in_progress", "review", "done"],
      timeline_entry_type: [
        "chat",
        "task",
        "status",
        "content",
        "design",
        "report",
        "manual",
        "onboarding",
        "meeting",
      ],
      tone_of_voice: ["formal", "funny", "authoritative", "casual"],
    },
  },
} as const

