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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_group: boolean
          last_message_at: string
          title: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_group?: boolean
          last_message_at?: string
          title?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_group?: boolean
          last_message_at?: string
          title?: string | null
        }
        Relationships: []
      }
      department_managers: {
        Row: {
          department_id: string
          id: string
          user_id: string
        }
        Insert: {
          department_id: string
          id?: string
          user_id: string
        }
        Update: {
          department_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_managers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      goals: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          current_value: number
          deadline: string | null
          department_id: string | null
          description: string | null
          id: string
          priority: string
          status: string
          target_value: number
          title: string
          unit: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          current_value?: number
          deadline?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          priority?: string
          status?: string
          target_value?: number
          title: string
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          current_value?: number
          deadline?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          priority?: string
          status?: string
          target_value?: number
          title?: string
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      kpis: {
        Row: {
          created_at: string
          current_value: number
          id: string
          kra_id: string | null
          metric: string | null
          period: string
          status: string
          target_value: number
          title: string
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_value?: number
          id?: string
          kra_id?: string | null
          metric?: string | null
          period?: string
          status?: string
          target_value?: number
          title: string
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_value?: number
          id?: string
          kra_id?: string | null
          metric?: string | null
          period?: string
          status?: string
          target_value?: number
          title?: string
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpis_kra_id_fkey"
            columns: ["kra_id"]
            isOneToOne: false
            referencedRelation: "kras"
            referencedColumns: ["id"]
          },
        ]
      }
      kras: {
        Row: {
          created_at: string
          description: string | null
          id: string
          period: string
          status: string
          target_date: string | null
          title: string
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          period?: string
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
          user_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          period?: string
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          created_at: string
          error_message: string | null
          gmail_message_id: string | null
          id: string
          metadata: Json | null
          notification_type: string
          recipient_email: string
          recipient_user_id: string | null
          status: string
          subject: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          gmail_message_id?: string | null
          id?: string
          metadata?: Json | null
          notification_type: string
          recipient_email: string
          recipient_user_id?: string | null
          status?: string
          subject: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          gmail_message_id?: string | null
          id?: string
          metadata?: Json | null
          notification_type?: string
          recipient_email?: string
          recipient_user_id?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          daily_digest: boolean
          monthly_report: boolean
          task_assigned: boolean
          task_due_reminder: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          daily_digest?: boolean
          monthly_report?: boolean
          task_assigned?: boolean
          task_due_reminder?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          daily_digest?: boolean
          monthly_report?: boolean
          task_assigned?: boolean
          task_due_reminder?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          id: string
          is_org_admin: boolean
          joined_at: string
          organization_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_org_admin?: boolean
          joined_at?: string
          organization_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_org_admin?: boolean
          joined_at?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          allow_public_email: boolean
          created_at: string
          created_by: string | null
          domain: string | null
          domain_type: Database["public"]["Enums"]["domain_type"]
          id: string
          name: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          allow_public_email?: boolean
          created_at?: string
          created_by?: string | null
          domain?: string | null
          domain_type?: Database["public"]["Enums"]["domain_type"]
          id?: string
          name: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          allow_public_email?: boolean
          created_at?: string
          created_by?: string | null
          domain?: string | null
          domain_type?: Database["public"]["Enums"]["domain_type"]
          id?: string
          name?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_google_connections: {
        Row: {
          access_token_ciphertext: string | null
          calendar_sync_enabled: boolean
          created_at: string
          expires_at: string | null
          gmail_tasks_enabled: boolean
          google_email: string
          google_sub: string | null
          last_calendar_sync_at: string | null
          organization_id: string | null
          refresh_token_ciphertext: string | null
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_ciphertext?: string | null
          calendar_sync_enabled?: boolean
          created_at?: string
          expires_at?: string | null
          gmail_tasks_enabled?: boolean
          google_email: string
          google_sub?: string | null
          last_calendar_sync_at?: string | null
          organization_id?: string | null
          refresh_token_ciphertext?: string | null
          scope?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_ciphertext?: string | null
          calendar_sync_enabled?: boolean
          created_at?: string
          expires_at?: string | null
          gmail_tasks_enabled?: boolean
          google_email?: string
          google_sub?: string | null
          last_calendar_sync_at?: string | null
          organization_id?: string | null
          refresh_token_ciphertext?: string | null
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_google_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_events: {
        Row: {
          attendees: Json
          created_at: string
          description: string | null
          end_at: string | null
          end_date: string | null
          google_calendar_id: string
          google_event_id: string
          hangout_link: string | null
          html_link: string | null
          id: string
          is_all_day: boolean
          location: string | null
          organization_id: string | null
          organizer_email: string | null
          raw_event: Json
          start_at: string | null
          start_date: string | null
          status: string
          synced_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendees?: Json
          created_at?: string
          description?: string | null
          end_at?: string | null
          end_date?: string | null
          google_calendar_id?: string
          google_event_id: string
          hangout_link?: string | null
          html_link?: string | null
          id?: string
          is_all_day?: boolean
          location?: string | null
          organization_id?: string | null
          organizer_email?: string | null
          raw_event?: Json
          start_at?: string | null
          start_date?: string | null
          status?: string
          synced_at?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendees?: Json
          created_at?: string
          description?: string | null
          end_at?: string | null
          end_date?: string | null
          google_calendar_id?: string
          google_event_id?: string
          hangout_link?: string | null
          html_link?: string | null
          id?: string
          is_all_day?: boolean
          location?: string | null
          organization_id?: string | null
          organizer_email?: string | null
          raw_event?: Json
          start_at?: string | null
          start_date?: string | null
          status?: string
          synced_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_scratch_notes: {
        Row: {
          id: string
          user_id: string
          content: string
          polished_content: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          content?: string
          polished_content?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          content?: string
          polished_content?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      in_app_notifications: {
        Row: {
          id: string
          user_id: string
          notification_type: string
          title: string
          body: string | null
          action_url: string | null
          metadata: Json | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          notification_type: string
          title: string
          body?: string | null
          action_url?: string | null
          metadata?: Json | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          notification_type?: string
          title?: string
          body?: string | null
          action_url?: string | null
          metadata?: Json | null
          read_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          department_id: string | null
          email: string
          firebase_uid: string | null
          id: string
          mobile_no: string | null
          name: string
          organization_id: string | null
          performance_score: number
          position: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          email: string
          firebase_uid?: string | null
          id: string
          mobile_no?: string | null
          name: string
          organization_id?: string | null
          performance_score?: number
          position?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          email?: string
          firebase_uid?: string | null
          id?: string
          mobile_no?: string | null
          name?: string
          organization_id?: string | null
          performance_score?: number
          position?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      task_assignees: {
        Row: {
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string | null
          file_url: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path?: string | null
          file_url: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string | null
          file_url?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_subtasks: {
        Row: {
          completed: boolean
          created_at: string
          id: string
          position: number
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: string
          position?: number
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: string
          position?: number
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          frequency: string
          id: string
          next_due_date: string | null
          organization_id: string | null
          priority: string
          recurrence_parent_id: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
          blocked_by: string[]
          depends_on: string[]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          frequency?: string
          id?: string
          next_due_date?: string | null
          organization_id?: string | null
          priority?: string
          recurrence_parent_id?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
          blocked_by?: string[]
          depends_on?: string[]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          frequency?: string
          id?: string
          next_due_date?: string | null
          organization_id?: string | null
          priority?: string
          recurrence_parent_id?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          blocked_by?: string[]
          depends_on?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_profiles_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workflow_field_values: {
        Row: {
          created_at: string
          field_key: string
          id: string
          label: string
          value: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string
          field_key: string
          id?: string
          label: string
          value?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string
          field_key?: string
          id?: string
          label?: string
          value?: string | null
          workflow_id?: string
        }
        Relationships: []
      }
      workflow_stage_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          stage_id: string
          workflow_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          stage_id: string
          workflow_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          stage_id?: string
          workflow_id?: string
        }
        Relationships: []
      }
      workflow_stage_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_value: string | null
          id: string
          metadata: Json | null
          note: string | null
          stage_id: string
          to_value: string | null
          workflow_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_value?: string | null
          id?: string
          metadata?: Json | null
          note?: string | null
          stage_id: string
          to_value?: string | null
          workflow_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_value?: string | null
          id?: string
          metadata?: Json | null
          note?: string | null
          stage_id?: string
          to_value?: string | null
          workflow_id?: string
        }
        Relationships: []
      }
      workflow_stages: {
        Row: {
          assignee_user_id: string | null
          attachments: Json
          blocked_reason: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          decision: string | null
          escalate_on_breach: boolean
          escalated_at: string | null
          help_mention_user_id: string | null
          help_requested_at: string | null
          help_requested_by: string | null
          help_requested_note: string | null
          id: string
          is_decision: boolean
          is_terminal: boolean
          last_escalated_at: string | null
          name: string
          no_next_position: number | null
          notes: string | null
          outcome_label: string | null
          owner_department_id: string | null
          position: number
          started_at: string | null
          status: string
          tat_hours: number
          workflow_id: string
          yes_next_position: number | null
        }
        Insert: {
          assignee_user_id?: string | null
          attachments?: Json
          blocked_reason?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          decision?: string | null
          escalate_on_breach?: boolean
          escalated_at?: string | null
          help_mention_user_id?: string | null
          help_requested_at?: string | null
          help_requested_by?: string | null
          help_requested_note?: string | null
          id?: string
          is_decision?: boolean
          is_terminal?: boolean
          last_escalated_at?: string | null
          name: string
          no_next_position?: number | null
          notes?: string | null
          outcome_label?: string | null
          owner_department_id?: string | null
          position: number
          started_at?: string | null
          status?: string
          tat_hours?: number
          workflow_id: string
          yes_next_position?: number | null
        }
        Update: {
          assignee_user_id?: string | null
          attachments?: Json
          blocked_reason?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          decision?: string | null
          escalate_on_breach?: boolean
          escalated_at?: string | null
          help_mention_user_id?: string | null
          help_requested_at?: string | null
          help_requested_by?: string | null
          help_requested_note?: string | null
          id?: string
          is_decision?: boolean
          is_terminal?: boolean
          last_escalated_at?: string | null
          name?: string
          no_next_position?: number | null
          notes?: string | null
          outcome_label?: string | null
          owner_department_id?: string | null
          position?: number
          started_at?: string | null
          status?: string
          tat_hours?: number
          workflow_id?: string
          yes_next_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_stages_owner_department_id_fkey"
            columns: ["owner_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_stages_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template_fields: {
        Row: {
          created_at: string
          field_key: string
          field_type: string
          id: string
          label: string
          position: number
          required: boolean
          template_id: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_type?: string
          id?: string
          label: string
          position?: number
          required?: boolean
          template_id: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_type?: string
          id?: string
          label?: string
          position?: number
          required?: boolean
          template_id?: string
        }
        Relationships: []
      }
      workflow_template_stages: {
        Row: {
          created_at: string
          default_assignee_user_id: string | null
          default_tat_hours: number
          description: string | null
          escalate_on_breach: boolean
          id: string
          is_decision: boolean
          is_terminal: boolean
          name: string
          no_next_position: number | null
          outcome_label: string | null
          owner_department_id: string | null
          position: number
          template_id: string
          yes_next_position: number | null
        }
        Insert: {
          created_at?: string
          default_assignee_user_id?: string | null
          default_tat_hours?: number
          description?: string | null
          escalate_on_breach?: boolean
          id?: string
          is_decision?: boolean
          is_terminal?: boolean
          name: string
          no_next_position?: number | null
          outcome_label?: string | null
          owner_department_id?: string | null
          position: number
          template_id: string
          yes_next_position?: number | null
        }
        Update: {
          created_at?: string
          default_assignee_user_id?: string | null
          default_tat_hours?: number
          description?: string | null
          escalate_on_breach?: boolean
          id?: string
          is_decision?: boolean
          is_terminal?: boolean
          name?: string
          no_next_position?: number | null
          outcome_label?: string | null
          owner_department_id?: string | null
          position?: number
          template_id?: string
          yes_next_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_stages_owner_department_id_fkey"
            columns: ["owner_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_stages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          active: boolean
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      workflows: {
        Row: {
          completed_at: string | null
          created_at: string
          current_stage_position: number
          description: string | null
          id: string
          outcome_label: string | null
          priority: string
          raised_by: string | null
          raised_by_department_id: string | null
          status: string
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_stage_position?: number
          description?: string | null
          id?: string
          outcome_label?: string | null
          priority?: string
          raised_by?: string | null
          raised_by_department_id?: string | null
          status?: string
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_stage_position?: number
          description?: string | null
          id?: string
          outcome_label?: string | null
          priority?: string
          raised_by?: string | null
          raised_by_department_id?: string | null
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_raised_by_department_id_fkey"
            columns: ["raised_by_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_task: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      create_conversation_with_participants: {
        Args: { _is_group: boolean; _participant_ids: string[]; _title: string }
        Returns: string
      }
      delete_conversation_cascade: {
        Args: { _conv_id: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_workflow_cascade: {
        Args: { _workflow_id: string }
        Returns: undefined
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      generate_workflow_indent_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_md: { Args: { _user_id: string }; Returns: boolean }
      is_conversation_participant: {
        Args: { _conv_id: string; _user_id: string }
        Returns: boolean
      }
      is_hr: { Args: { _user_id: string }; Returns: boolean }
      is_org_admin: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_task_assignee: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      manages_department: {
        Args: { _dept_id: string; _user_id: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      task_department: { Args: { _task_id: string }; Returns: string }
      user_in_workflow: {
        Args: { _user_id: string; _workflow_id: string }
        Returns: boolean
      }
      user_organization_id: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "managing_director"
        | "system_admin"
        | "department_manager"
        | "employee"
        | "hr"
      domain_type: "custom" | "public"
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
      app_role: [
        "managing_director",
        "system_admin",
        "department_manager",
        "employee",
        "hr",
      ],
      domain_type: ["custom", "public"],
    },
  },
} as const
