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
      authorized_case_exceptions: {
        Row: {
          approved_by: string | null
          approved_via_escalation_id: string | null
          created_at: string
          effective_from: string
          effective_until: string | null
          id: string
          notes: string | null
          override_payload: Json
          overrides_action_key: string
          photographer_id: string
          status: string
          target_playbook_rule_id: string | null
          thread_id: string | null
          updated_at: string
          wedding_id: string
        }
        Insert: {
          approved_by?: string | null
          approved_via_escalation_id?: string | null
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          notes?: string | null
          override_payload?: Json
          overrides_action_key: string
          photographer_id: string
          status?: string
          target_playbook_rule_id?: string | null
          thread_id?: string | null
          updated_at?: string
          wedding_id: string
        }
        Update: {
          approved_by?: string | null
          approved_via_escalation_id?: string | null
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          notes?: string | null
          override_payload?: Json
          overrides_action_key?: string
          photographer_id?: string
          status?: string
          target_playbook_rule_id?: string | null
          thread_id?: string | null
          updated_at?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "authorized_case_exceptions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorized_case_exceptions_approved_via_escalation_id_fkey"
            columns: ["approved_via_escalation_id"]
            isOneToOne: false
            referencedRelation: "escalation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorized_case_exceptions_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorized_case_exceptions_target_playbook_rule_id_fkey"
            columns: ["target_playbook_rule_id"]
            isOneToOne: false
            referencedRelation: "playbook_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorized_case_exceptions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorized_case_exceptions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorized_case_exceptions_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          client_id: string | null
          end_time: string
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          meeting_link: string | null
          photographer_id: string
          start_time: string
          title: string
          wedding_id: string | null
        }
        Insert: {
          client_id?: string | null
          end_time: string
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          meeting_link?: string | null
          photographer_id: string
          start_time: string
          title: string
          wedding_id?: string | null
        }
        Update: {
          client_id?: string | null
          end_time?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          meeting_link?: string | null
          photographer_id?: string
          start_time?: string
          title?: string
          wedding_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          email: string | null
          id: string
          name: string
          role: string | null
          wedding_id: string
        }
        Insert: {
          email?: string | null
          id?: string
          name: string
          role?: string | null
          wedding_id: string
        }
        Update: {
          email?: string | null
          id?: string
          name?: string
          role?: string | null
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_account_gmail_label_cache: {
        Row: {
          connected_account_id: string
          labels_json: Json
          last_error: string | null
          photographer_id: string
          refresh_in_progress: boolean
          refreshed_at: string | null
          updated_at: string
        }
        Insert: {
          connected_account_id: string
          labels_json?: Json
          last_error?: string | null
          photographer_id: string
          refresh_in_progress?: boolean
          refreshed_at?: string | null
          updated_at?: string
        }
        Update: {
          connected_account_id?: string
          labels_json?: Json
          last_error?: string | null
          photographer_id?: string
          refresh_in_progress?: boolean
          refreshed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_account_gmail_label_cache_connected_account_id_fkey"
            columns: ["connected_account_id"]
            isOneToOne: true
            referencedRelation: "connected_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connected_account_gmail_label_cache_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_account_oauth_tokens: {
        Row: {
          access_token: string
          connected_account_id: string
          refresh_token: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          connected_account_id: string
          refresh_token?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          connected_account_id?: string
          refresh_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_account_oauth_tokens_connected_account_id_fkey"
            columns: ["connected_account_id"]
            isOneToOne: true
            referencedRelation: "connected_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_accounts: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          gmail_delta_sync_last_error: string | null
          gmail_delta_sync_last_error_at: string | null
          gmail_last_history_id: string | null
          gmail_sync_degraded: boolean
          gmail_watch_expiration: string | null
          gmail_watch_last_renewed_at: string | null
          id: string
          photographer_id: string
          provider: string
          provider_account_id: string
          sync_error_summary: string | null
          sync_status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          gmail_delta_sync_last_error?: string | null
          gmail_delta_sync_last_error_at?: string | null
          gmail_last_history_id?: string | null
          gmail_sync_degraded?: boolean
          gmail_watch_expiration?: string | null
          gmail_watch_last_renewed_at?: string | null
          id?: string
          photographer_id: string
          provider: string
          provider_account_id: string
          sync_error_summary?: string | null
          sync_status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          gmail_delta_sync_last_error?: string | null
          gmail_delta_sync_last_error_at?: string | null
          gmail_last_history_id?: string | null
          gmail_sync_degraded?: boolean
          gmail_watch_expiration?: string | null
          gmail_watch_last_renewed_at?: string | null
          id?: string
          photographer_id?: string
          provider?: string
          provider_account_id?: string
          sync_error_summary?: string | null
          sync_status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_accounts_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_points: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          kind: Database["public"]["Enums"]["contact_point_kind"]
          person_id: string
          photographer_id: string
          value_normalized: string
          value_raw: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          kind: Database["public"]["Enums"]["contact_point_kind"]
          person_id: string
          photographer_id: string
          value_normalized: string
          value_raw: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: Database["public"]["Enums"]["contact_point_kind"]
          person_id?: string
          photographer_id?: string
          value_normalized?: string
          value_raw?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_points_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_points_tenant_person_fkey"
            columns: ["photographer_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["photographer_id", "id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          metadata: Json | null
          photographer_id: string
          provider_url: string | null
          storage_path: string | null
          title: string
          wedding_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["document_kind"]
          metadata?: Json | null
          photographer_id: string
          provider_url?: string | null
          storage_path?: string | null
          title: string
          wedding_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          metadata?: Json | null
          photographer_id?: string
          provider_url?: string | null
          storage_path?: string | null
          title?: string
          wedding_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      drafts: {
        Row: {
          body: string
          created_at: string
          decision_mode: Database["public"]["Enums"]["decision_mode"] | null
          id: string
          instruction_history: Json | null
          locked_for_sending_at: string | null
          photographer_id: string
          source_action_key: string | null
          status: Database["public"]["Enums"]["draft_status"]
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          decision_mode?: Database["public"]["Enums"]["decision_mode"] | null
          id?: string
          instruction_history?: Json | null
          locked_for_sending_at?: string | null
          photographer_id: string
          source_action_key?: string | null
          status?: Database["public"]["Enums"]["draft_status"]
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          decision_mode?: Database["public"]["Enums"]["decision_mode"] | null
          id?: string
          instruction_history?: Json | null
          locked_for_sending_at?: string | null
          photographer_id?: string
          source_action_key?: string | null
          status?: Database["public"]["Enums"]["draft_status"]
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drafts_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_operator_turns: {
        Row: {
          body: string
          created_at: string
          direction: string
          escalation_id: string
          id: string
          metadata: Json | null
          photographer_id: string
          raw_channel: string
        }
        Insert: {
          body: string
          created_at?: string
          direction: string
          escalation_id: string
          id?: string
          metadata?: Json | null
          photographer_id: string
          raw_channel?: string
        }
        Update: {
          body?: string
          created_at?: string
          direction?: string
          escalation_id?: string
          id?: string
          metadata?: Json | null
          photographer_id?: string
          raw_channel?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_operator_turns_escalation_id_fkey"
            columns: ["escalation_id"]
            isOneToOne: false
            referencedRelation: "escalation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_operator_turns_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_requests: {
        Row: {
          action_key: string
          created_at: string
          decision_justification: Json
          id: string
          learning_outcome:
            | Database["public"]["Enums"]["escalation_learning_outcome"]
            | null
          operator_delivery: Database["public"]["Enums"]["escalation_operator_delivery"]
          photographer_id: string
          playbook_rule_id: string | null
          promote_to_playbook: boolean
          question_body: string
          reason_code: string
          recommended_resolution: string | null
          resolution_storage_target: string | null
          resolution_text: string | null
          resolved_at: string | null
          resolved_decision_mode:
            | Database["public"]["Enums"]["decision_mode"]
            | null
          status: Database["public"]["Enums"]["escalation_status"]
          thread_id: string | null
          wedding_id: string | null
        }
        Insert: {
          action_key: string
          created_at?: string
          decision_justification: Json
          id?: string
          learning_outcome?:
            | Database["public"]["Enums"]["escalation_learning_outcome"]
            | null
          operator_delivery?: Database["public"]["Enums"]["escalation_operator_delivery"]
          photographer_id: string
          playbook_rule_id?: string | null
          promote_to_playbook?: boolean
          question_body: string
          reason_code: string
          recommended_resolution?: string | null
          resolution_storage_target?: string | null
          resolution_text?: string | null
          resolved_at?: string | null
          resolved_decision_mode?:
            | Database["public"]["Enums"]["decision_mode"]
            | null
          status?: Database["public"]["Enums"]["escalation_status"]
          thread_id?: string | null
          wedding_id?: string | null
        }
        Update: {
          action_key?: string
          created_at?: string
          decision_justification?: Json
          id?: string
          learning_outcome?:
            | Database["public"]["Enums"]["escalation_learning_outcome"]
            | null
          operator_delivery?: Database["public"]["Enums"]["escalation_operator_delivery"]
          photographer_id?: string
          playbook_rule_id?: string | null
          promote_to_playbook?: boolean
          question_body?: string
          reason_code?: string
          recommended_resolution?: string | null
          resolution_storage_target?: string | null
          resolution_text?: string | null
          resolved_at?: string | null
          resolved_decision_mode?:
            | Database["public"]["Enums"]["decision_mode"]
            | null
          status?: Database["public"]["Enums"]["escalation_status"]
          thread_id?: string | null
          wedding_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalation_requests_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_requests_playbook_rule_id_fkey"
            columns: ["playbook_rule_id"]
            isOneToOne: false
            referencedRelation: "playbook_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_requests_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_requests_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_requests_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_resolution_jobs: {
        Row: {
          created_at: string
          escalation_id: string
          id: string
          last_error: string | null
          photographer_id: string
          photographer_reply_raw: string
          resolution_summary: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          escalation_id: string
          id?: string
          last_error?: string | null
          photographer_id: string
          photographer_reply_raw: string
          resolution_summary: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          escalation_id?: string
          id?: string
          last_error?: string | null
          photographer_id?: string
          photographer_reply_raw?: string
          resolution_summary?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_resolution_jobs_escalation_id_fkey"
            columns: ["escalation_id"]
            isOneToOne: true
            referencedRelation: "escalation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_resolution_jobs_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_import_secondary_pending: {
        Row: {
          created_at: string
          detail: Json
          id: string
          import_candidate_id: string
          message_id: string
          pending_kind: string
          photographer_id: string
          status: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: string
          import_candidate_id: string
          message_id: string
          pending_kind: string
          photographer_id: string
          status?: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: string
          import_candidate_id?: string
          message_id?: string
          pending_kind?: string
          photographer_id?: string
          status?: string
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_import_secondary_pending_import_candidate_id_fkey"
            columns: ["import_candidate_id"]
            isOneToOne: false
            referencedRelation: "import_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_import_secondary_pending_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_import_secondary_pending_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["latest_message_id"]
          },
          {
            foreignKeyName: "gmail_import_secondary_pending_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_import_secondary_pending_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_import_secondary_pending_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_label_import_groups: {
        Row: {
          approval_approved_count: number
          approval_failed_count: number
          approval_failed_detail: Json
          approval_last_error: string | null
          approval_processed_count: number
          approval_total_candidates: number
          connected_account_id: string
          created_at: string
          id: string
          materialized_wedding_id: string | null
          photographer_id: string
          source_identifier: string
          source_label_name: string
          status: string
          updated_at: string
        }
        Insert: {
          approval_approved_count?: number
          approval_failed_count?: number
          approval_failed_detail?: Json
          approval_last_error?: string | null
          approval_processed_count?: number
          approval_total_candidates?: number
          connected_account_id: string
          created_at?: string
          id?: string
          materialized_wedding_id?: string | null
          photographer_id: string
          source_identifier: string
          source_label_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          approval_approved_count?: number
          approval_failed_count?: number
          approval_failed_detail?: Json
          approval_last_error?: string | null
          approval_processed_count?: number
          approval_total_candidates?: number
          connected_account_id?: string
          created_at?: string
          id?: string
          materialized_wedding_id?: string | null
          photographer_id?: string
          source_identifier?: string
          source_label_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_label_import_groups_connected_account_id_fkey"
            columns: ["connected_account_id"]
            isOneToOne: false
            referencedRelation: "connected_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_label_import_groups_materialized_wedding_id_fkey"
            columns: ["materialized_wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_label_import_groups_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_render_artifacts: {
        Row: {
          byte_size: number
          content_sha256: string | null
          created_at: string
          id: string
          import_candidate_id: string | null
          message_id: string | null
          photographer_id: string
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          byte_size: number
          content_sha256?: string | null
          created_at?: string
          id?: string
          import_candidate_id?: string | null
          message_id?: string | null
          photographer_id: string
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          byte_size?: number
          content_sha256?: string | null
          created_at?: string
          id?: string
          import_candidate_id?: string | null
          message_id?: string | null
          photographer_id?: string
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_render_artifacts_import_candidate_id_fkey"
            columns: ["import_candidate_id"]
            isOneToOne: false
            referencedRelation: "import_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_render_artifacts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_render_artifacts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["latest_message_id"]
          },
          {
            foreignKeyName: "gmail_render_artifacts_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_repair_worker_state: {
        Row: {
          id: string
          last_run_at: string | null
          last_run_error: string | null
          last_run_failed: number | null
          last_run_failure_samples: Json | null
          last_run_kind: string | null
          last_run_migrated: number | null
          last_run_ok: boolean | null
          last_run_scanned: number | null
          last_run_skipped_already_ref: number | null
          last_run_skipped_artifact_fk: number | null
          last_run_skipped_no_inline: number | null
          paused: boolean
          paused_updated_at: string | null
          updated_at: string
        }
        Insert: {
          id: string
          last_run_at?: string | null
          last_run_error?: string | null
          last_run_failed?: number | null
          last_run_failure_samples?: Json | null
          last_run_kind?: string | null
          last_run_migrated?: number | null
          last_run_ok?: boolean | null
          last_run_scanned?: number | null
          last_run_skipped_already_ref?: number | null
          last_run_skipped_artifact_fk?: number | null
          last_run_skipped_no_inline?: number | null
          paused?: boolean
          paused_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          last_run_at?: string | null
          last_run_error?: string | null
          last_run_failed?: number | null
          last_run_failure_samples?: Json | null
          last_run_kind?: string | null
          last_run_migrated?: number | null
          last_run_ok?: boolean | null
          last_run_scanned?: number | null
          last_run_skipped_already_ref?: number | null
          last_run_skipped_artifact_fk?: number | null
          last_run_skipped_no_inline?: number | null
          paused?: boolean
          paused_updated_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      import_candidates: {
        Row: {
          connected_account_id: string
          created_at: string
          extracted_couple_names: string | null
          extracted_date: string | null
          gmail_label_import_group_id: string | null
          id: string
          import_approval_error: string | null
          import_provenance: Json | null
          materialization_artifact: Json | null
          materialization_artifact_version: number
          materialization_prepare_error: string | null
          materialization_prepare_started_at: string | null
          materialization_prepare_status: string
          materialization_prepared_at: string | null
          materialization_render_artifact_id: string | null
          materialization_secondary_status: string | null
          materialized_thread_id: string | null
          message_count: number
          photographer_id: string
          raw_provider_thread_id: string
          snippet: string | null
          source_identifier: string
          source_label_name: string
          source_type: string
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          connected_account_id: string
          created_at?: string
          extracted_couple_names?: string | null
          extracted_date?: string | null
          gmail_label_import_group_id?: string | null
          id?: string
          import_approval_error?: string | null
          import_provenance?: Json | null
          materialization_artifact?: Json | null
          materialization_artifact_version?: number
          materialization_prepare_error?: string | null
          materialization_prepare_started_at?: string | null
          materialization_prepare_status?: string
          materialization_prepared_at?: string | null
          materialization_render_artifact_id?: string | null
          materialization_secondary_status?: string | null
          materialized_thread_id?: string | null
          message_count?: number
          photographer_id: string
          raw_provider_thread_id: string
          snippet?: string | null
          source_identifier: string
          source_label_name: string
          source_type: string
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          connected_account_id?: string
          created_at?: string
          extracted_couple_names?: string | null
          extracted_date?: string | null
          gmail_label_import_group_id?: string | null
          id?: string
          import_approval_error?: string | null
          import_provenance?: Json | null
          materialization_artifact?: Json | null
          materialization_artifact_version?: number
          materialization_prepare_error?: string | null
          materialization_prepare_started_at?: string | null
          materialization_prepare_status?: string
          materialization_prepared_at?: string | null
          materialization_render_artifact_id?: string | null
          materialization_secondary_status?: string | null
          materialized_thread_id?: string | null
          message_count?: number
          photographer_id?: string
          raw_provider_thread_id?: string
          snippet?: string | null
          source_identifier?: string
          source_label_name?: string
          source_type?: string
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_candidates_connected_account_id_fkey"
            columns: ["connected_account_id"]
            isOneToOne: false
            referencedRelation: "connected_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_candidates_gmail_label_import_group_id_fkey"
            columns: ["gmail_label_import_group_id"]
            isOneToOne: false
            referencedRelation: "gmail_label_import_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_candidates_materialization_render_artifact_id_fkey"
            columns: ["materialization_render_artifact_id"]
            isOneToOne: false
            referencedRelation: "gmail_render_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_candidates_materialized_thread_id_fkey"
            columns: ["materialized_thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_candidates_materialized_thread_id_fkey"
            columns: ["materialized_thread_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_candidates_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          content: string
          created_at: string | null
          document_type: string
          embedding: string | null
          id: string
          metadata: Json | null
          photographer_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          document_type: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          photographer_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          document_type?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          photographer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          archived_at: string | null
          full_content: string
          id: string
          learning_loop_artifact_key: string | null
          person_id: string | null
          photographer_id: string
          scope: Database["public"]["Enums"]["memory_scope"]
          source_escalation_id: string | null
          summary: string
          title: string
          type: string
          wedding_id: string | null
        }
        Insert: {
          archived_at?: string | null
          full_content: string
          id?: string
          learning_loop_artifact_key?: string | null
          person_id?: string | null
          photographer_id: string
          scope?: Database["public"]["Enums"]["memory_scope"]
          source_escalation_id?: string | null
          summary: string
          title: string
          type: string
          wedding_id?: string | null
        }
        Update: {
          archived_at?: string | null
          full_content?: string
          id?: string
          learning_loop_artifact_key?: string | null
          person_id?: string | null
          photographer_id?: string
          scope?: Database["public"]["Enums"]["memory_scope"]
          source_escalation_id?: string | null
          summary?: string
          title?: string
          type?: string
          wedding_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memories_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_source_escalation_id_fkey"
            columns: ["source_escalation_id"]
            isOneToOne: false
            referencedRelation: "escalation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          id: string
          kind: string
          message_id: string
          metadata: Json | null
          mime_type: string | null
          photographer_id: string
          source_url: string
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          message_id: string
          metadata?: Json | null
          mime_type?: string | null
          photographer_id: string
          source_url: string
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message_id?: string
          metadata?: Json | null
          mime_type?: string | null
          photographer_id?: string
          source_url?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["latest_message_id"]
          },
          {
            foreignKeyName: "message_attachments_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          direction: Database["public"]["Enums"]["message_direction"]
          gmail_render_artifact_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          photographer_id: string
          provider_message_id: string | null
          raw_payload: Json | null
          sender: string
          sent_at: string
          thread_id: string
        }
        Insert: {
          body: string
          direction: Database["public"]["Enums"]["message_direction"]
          gmail_render_artifact_id?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          photographer_id: string
          provider_message_id?: string | null
          raw_payload?: Json | null
          sender: string
          sent_at?: string
          thread_id: string
        }
        Update: {
          body?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          gmail_render_artifact_id?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          photographer_id?: string
          provider_message_id?: string | null
          raw_payload?: Json | null
          sender?: string
          sent_at?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_gmail_render_artifact_id_fkey"
            columns: ["gmail_render_artifact_id"]
            isOneToOne: false
            referencedRelation: "gmail_render_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          canonical_name: string
          created_at: string
          display_name: string
          id: string
          kind: Database["public"]["Enums"]["person_kind"]
          notes: string | null
          photographer_id: string
          updated_at: string
        }
        Insert: {
          canonical_name: string
          created_at?: string
          display_name: string
          id?: string
          kind: Database["public"]["Enums"]["person_kind"]
          notes?: string | null
          photographer_id: string
          updated_at?: string
        }
        Update: {
          canonical_name?: string
          created_at?: string
          display_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["person_kind"]
          notes?: string | null
          photographer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      photographers: {
        Row: {
          email: string
          id: string
          settings: Json | null
        }
        Insert: {
          email: string
          id?: string
          settings?: Json | null
        }
        Update: {
          email?: string
          id?: string
          settings?: Json | null
        }
        Relationships: []
      }
      playbook_rule_candidates: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          observation_count: number
          operator_resolution_summary: string | null
          originating_operator_text: string | null
          photographer_id: string
          promoted_to_playbook_rule_id: string | null
          proposed_action_key: string
          proposed_channel: Database["public"]["Enums"]["thread_channel"] | null
          proposed_decision_mode: Database["public"]["Enums"]["decision_mode"]
          proposed_instruction: string
          proposed_scope: Database["public"]["Enums"]["rule_scope"]
          review_status: string
          reviewed_at: string | null
          reviewed_by_photographer_id: string | null
          source_classification: Json
          source_escalation_id: string | null
          superseded_by_id: string | null
          thread_id: string | null
          topic: string
          updated_at: string
          wedding_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          observation_count?: number
          operator_resolution_summary?: string | null
          originating_operator_text?: string | null
          photographer_id: string
          promoted_to_playbook_rule_id?: string | null
          proposed_action_key: string
          proposed_channel?:
            | Database["public"]["Enums"]["thread_channel"]
            | null
          proposed_decision_mode?: Database["public"]["Enums"]["decision_mode"]
          proposed_instruction: string
          proposed_scope?: Database["public"]["Enums"]["rule_scope"]
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_photographer_id?: string | null
          source_classification?: Json
          source_escalation_id?: string | null
          superseded_by_id?: string | null
          thread_id?: string | null
          topic: string
          updated_at?: string
          wedding_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          observation_count?: number
          operator_resolution_summary?: string | null
          originating_operator_text?: string | null
          photographer_id?: string
          promoted_to_playbook_rule_id?: string | null
          proposed_action_key?: string
          proposed_channel?:
            | Database["public"]["Enums"]["thread_channel"]
            | null
          proposed_decision_mode?: Database["public"]["Enums"]["decision_mode"]
          proposed_instruction?: string
          proposed_scope?: Database["public"]["Enums"]["rule_scope"]
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_photographer_id?: string | null
          source_classification?: Json
          source_escalation_id?: string | null
          superseded_by_id?: string | null
          thread_id?: string | null
          topic?: string
          updated_at?: string
          wedding_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playbook_rule_candidates_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_rule_candidates_promoted_to_playbook_rule_id_fkey"
            columns: ["promoted_to_playbook_rule_id"]
            isOneToOne: false
            referencedRelation: "playbook_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_rule_candidates_reviewed_by_photographer_id_fkey"
            columns: ["reviewed_by_photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_rule_candidates_source_escalation_id_fkey"
            columns: ["source_escalation_id"]
            isOneToOne: false
            referencedRelation: "escalation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_rule_candidates_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "playbook_rule_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_rule_candidates_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_rule_candidates_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_rule_candidates_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_rules: {
        Row: {
          action_key: string
          channel: Database["public"]["Enums"]["thread_channel"] | null
          confidence_label: string
          created_at: string
          decision_mode: Database["public"]["Enums"]["decision_mode"]
          id: string
          instruction: string
          is_active: boolean
          photographer_id: string
          scope: Database["public"]["Enums"]["rule_scope"]
          source_type: string
          topic: string
          updated_at: string
        }
        Insert: {
          action_key: string
          channel?: Database["public"]["Enums"]["thread_channel"] | null
          confidence_label?: string
          created_at?: string
          decision_mode: Database["public"]["Enums"]["decision_mode"]
          id?: string
          instruction: string
          is_active?: boolean
          photographer_id: string
          scope: Database["public"]["Enums"]["rule_scope"]
          source_type: string
          topic: string
          updated_at?: string
        }
        Update: {
          action_key?: string
          channel?: Database["public"]["Enums"]["thread_channel"] | null
          confidence_label?: string
          created_at?: string
          decision_mode?: Database["public"]["Enums"]["decision_mode"]
          id?: string
          instruction?: string
          is_active?: boolean
          photographer_id?: string
          scope?: Database["public"]["Enums"]["rule_scope"]
          source_type?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_rules_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_business_profiles: {
        Row: {
          booking_scope: Json
          client_types: Json
          core_services: Json
          created_at: string
          deliverable_types: Json
          extensions: Json
          geographic_scope: Json
          id: string
          language_support: Json
          lead_acceptance_rules: Json
          photographer_id: string
          service_availability: Json
          service_types: Json
          source_type: string
          team_structure: Json
          travel_policy: Json
          updated_at: string
        }
        Insert: {
          booking_scope?: Json
          client_types?: Json
          core_services?: Json
          created_at?: string
          deliverable_types?: Json
          extensions?: Json
          geographic_scope?: Json
          id?: string
          language_support?: Json
          lead_acceptance_rules?: Json
          photographer_id: string
          service_availability?: Json
          service_types?: Json
          source_type?: string
          team_structure?: Json
          travel_policy?: Json
          updated_at?: string
        }
        Update: {
          booking_scope?: Json
          client_types?: Json
          core_services?: Json
          created_at?: string
          deliverable_types?: Json
          extensions?: Json
          geographic_scope?: Json
          id?: string
          language_support?: Json
          lead_acceptance_rules?: Json
          photographer_id?: string
          service_availability?: Json
          service_types?: Json
          source_type?: string
          team_structure?: Json
          travel_policy?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_business_profiles_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: true
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          due_date: string
          id: string
          photographer_id: string
          status: Database["public"]["Enums"]["task_status"]
          thread_id: string | null
          title: string
          wedding_id: string | null
        }
        Insert: {
          due_date: string
          id?: string
          photographer_id: string
          status?: Database["public"]["Enums"]["task_status"]
          thread_id?: string | null
          title: string
          wedding_id?: string | null
        }
        Update: {
          due_date?: string
          id?: string
          photographer_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          thread_id?: string | null
          title?: string
          wedding_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_participants: {
        Row: {
          created_at: string
          id: string
          is_cc: boolean
          is_recipient: boolean
          is_sender: boolean
          person_id: string
          photographer_id: string
          thread_id: string
          visibility_role: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_cc?: boolean
          is_recipient?: boolean
          is_sender?: boolean
          person_id: string
          photographer_id: string
          thread_id: string
          visibility_role: string
        }
        Update: {
          created_at?: string
          id?: string
          is_cc?: boolean
          is_recipient?: boolean
          is_sender?: boolean
          person_id?: string
          photographer_id?: string
          thread_id?: string
          visibility_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_participants_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_participants_tenant_person_fkey"
            columns: ["photographer_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["photographer_id", "id"]
          },
          {
            foreignKeyName: "thread_participants_tenant_thread_fkey"
            columns: ["photographer_id", "thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["photographer_id", "id"]
          },
          {
            foreignKeyName: "thread_participants_tenant_thread_fkey"
            columns: ["photographer_id", "thread_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["photographer_id", "id"]
          },
        ]
      }
      thread_summaries: {
        Row: {
          last_message_id: string | null
          photographer_id: string
          summary: string
          thread_id: string
        }
        Insert: {
          last_message_id?: string | null
          photographer_id: string
          summary: string
          thread_id: string
        }
        Update: {
          last_message_id?: string | null
          photographer_id?: string
          summary?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_summaries_last_message_id_fkey"
            columns: ["last_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_summaries_last_message_id_fkey"
            columns: ["last_message_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["latest_message_id"]
          },
          {
            foreignKeyName: "thread_summaries_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_summaries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: true
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_summaries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: true
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_weddings: {
        Row: {
          confidence_score: number | null
          created_at: string
          id: string
          photographer_id: string
          reasoning: string | null
          relation: Database["public"]["Enums"]["thread_wedding_relation"]
          thread_id: string
          wedding_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          photographer_id: string
          reasoning?: string | null
          relation: Database["public"]["Enums"]["thread_wedding_relation"]
          thread_id: string
          wedding_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          photographer_id?: string
          reasoning?: string | null
          relation?: Database["public"]["Enums"]["thread_wedding_relation"]
          thread_id?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_weddings_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_weddings_tenant_thread_fkey"
            columns: ["photographer_id", "thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["photographer_id", "id"]
          },
          {
            foreignKeyName: "thread_weddings_tenant_thread_fkey"
            columns: ["photographer_id", "thread_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["photographer_id", "id"]
          },
          {
            foreignKeyName: "thread_weddings_tenant_wedding_fkey"
            columns: ["photographer_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["photographer_id", "id"]
          },
        ]
      }
      threads: {
        Row: {
          ai_routing_metadata: Json | null
          automation_mode: Database["public"]["Enums"]["automation_mode"]
          channel: Database["public"]["Enums"]["thread_channel"]
          external_thread_key: string | null
          id: string
          kind: Database["public"]["Enums"]["thread_kind"]
          last_activity_at: string
          last_inbound_at: string | null
          last_outbound_at: string | null
          needs_human: boolean
          photographer_id: string
          status: string
          title: string
          v3_operator_automation_hold: boolean
          v3_operator_hold_escalation_id: string | null
          wedding_id: string | null
        }
        Insert: {
          ai_routing_metadata?: Json | null
          automation_mode?: Database["public"]["Enums"]["automation_mode"]
          channel?: Database["public"]["Enums"]["thread_channel"]
          external_thread_key?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["thread_kind"]
          last_activity_at?: string
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          needs_human?: boolean
          photographer_id: string
          status?: string
          title: string
          v3_operator_automation_hold?: boolean
          v3_operator_hold_escalation_id?: string | null
          wedding_id?: string | null
        }
        Update: {
          ai_routing_metadata?: Json | null
          automation_mode?: Database["public"]["Enums"]["automation_mode"]
          channel?: Database["public"]["Enums"]["thread_channel"]
          external_thread_key?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["thread_kind"]
          last_activity_at?: string
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          needs_human?: boolean
          photographer_id?: string
          status?: string
          title?: string
          v3_operator_automation_hold?: boolean
          v3_operator_hold_escalation_id?: string | null
          wedding_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "threads_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_v3_operator_hold_escalation_id_fkey"
            columns: ["v3_operator_hold_escalation_id"]
            isOneToOne: false
            referencedRelation: "escalation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_thread_workflow_state: {
        Row: {
          next_due_at: string | null
          photographer_id: string
          thread_id: string
          updated_at: string
          wedding_id: string | null
          workflow: Json
        }
        Insert: {
          next_due_at?: string | null
          photographer_id: string
          thread_id: string
          updated_at?: string
          wedding_id?: string | null
          workflow?: Json
        }
        Update: {
          next_due_at?: string | null
          photographer_id?: string
          thread_id?: string
          updated_at?: string
          wedding_id?: string | null
          workflow?: Json
        }
        Relationships: [
          {
            foreignKeyName: "v3_thread_workflow_state_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_thread_workflow_state_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_thread_workflow_state_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_thread_workflow_state_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      wedding_milestones: {
        Row: {
          moodboard_received: boolean
          photographer_id: string
          questionnaire_completed: boolean
          questionnaire_sent: boolean
          retainer_paid: boolean
          timeline_received: boolean
          wedding_id: string
        }
        Insert: {
          moodboard_received?: boolean
          photographer_id: string
          questionnaire_completed?: boolean
          questionnaire_sent?: boolean
          retainer_paid?: boolean
          timeline_received?: boolean
          wedding_id: string
        }
        Update: {
          moodboard_received?: boolean
          photographer_id?: string
          questionnaire_completed?: boolean
          questionnaire_sent?: boolean
          retainer_paid?: boolean
          timeline_received?: boolean
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wedding_milestones_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wedding_milestones_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: true
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      wedding_people: {
        Row: {
          created_at: string
          id: string
          is_approval_contact: boolean
          is_billing_contact: boolean
          is_payer: boolean
          is_primary_contact: boolean
          is_timeline_contact: boolean
          must_be_kept_in_loop: boolean
          notes: string | null
          person_id: string
          photographer_id: string
          relationship_modes: Json | null
          role_label: string
          wedding_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_approval_contact?: boolean
          is_billing_contact?: boolean
          is_payer?: boolean
          is_primary_contact?: boolean
          is_timeline_contact?: boolean
          must_be_kept_in_loop?: boolean
          notes?: string | null
          person_id: string
          photographer_id: string
          relationship_modes?: Json | null
          role_label: string
          wedding_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_approval_contact?: boolean
          is_billing_contact?: boolean
          is_payer?: boolean
          is_primary_contact?: boolean
          is_timeline_contact?: boolean
          must_be_kept_in_loop?: boolean
          notes?: string | null
          person_id?: string
          photographer_id?: string
          relationship_modes?: Json | null
          role_label?: string
          wedding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wedding_people_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wedding_people_tenant_person_fkey"
            columns: ["photographer_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["photographer_id", "id"]
          },
          {
            foreignKeyName: "wedding_people_tenant_wedding_fkey"
            columns: ["photographer_id", "wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["photographer_id", "id"]
          },
        ]
      }
      weddings: {
        Row: {
          agency_cc_lock: boolean
          balance_due: number | null
          compassion_pause: boolean
          contract_value: number | null
          couple_names: string
          event_end_date: string | null
          event_start_date: string | null
          id: string
          location: string
          package_inclusions: string[]
          package_name: string | null
          photographer_id: string
          project_type: Database["public"]["Enums"]["wedding_project_type"]
          stage: Database["public"]["Enums"]["project_stage"]
          story_notes: string | null
          strategic_pause: boolean
          wedding_date: string | null
        }
        Insert: {
          agency_cc_lock?: boolean
          balance_due?: number | null
          compassion_pause?: boolean
          contract_value?: number | null
          couple_names: string
          event_end_date?: string | null
          event_start_date?: string | null
          id?: string
          location: string
          package_inclusions?: string[]
          package_name?: string | null
          photographer_id: string
          project_type?: Database["public"]["Enums"]["wedding_project_type"]
          stage?: Database["public"]["Enums"]["project_stage"]
          story_notes?: string | null
          strategic_pause?: boolean
          wedding_date?: string | null
        }
        Update: {
          agency_cc_lock?: boolean
          balance_due?: number | null
          compassion_pause?: boolean
          contract_value?: number | null
          couple_names?: string
          event_end_date?: string | null
          event_start_date?: string | null
          id?: string
          location?: string
          package_inclusions?: string[]
          package_name?: string | null
          photographer_id?: string
          project_type?: Database["public"]["Enums"]["wedding_project_type"]
          stage?: Database["public"]["Enums"]["project_stage"]
          story_notes?: string | null
          strategic_pause?: boolean
          wedding_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weddings_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_open_tasks_with_wedding: {
        Row: {
          couple_names: string | null
          due_date: string | null
          id: string | null
          photographer_id: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string | null
          wedding_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pending_approval_drafts: {
        Row: {
          body: string | null
          couple_names: string | null
          created_at: string | null
          id: string | null
          photographer_id: string | null
          thread_id: string | null
          thread_title: string | null
          wedding_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drafts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "v_threads_inbox_latest_message"
            referencedColumns: ["id"]
          },
        ]
      }
      v_threads_inbox_latest_message: {
        Row: {
          ai_routing_metadata: Json | null
          id: string | null
          kind: Database["public"]["Enums"]["thread_kind"] | null
          last_activity_at: string | null
          latest_attachments_json: Json | null
          latest_body: string | null
          latest_message_id: string | null
          latest_message_metadata: Json | null
          latest_provider_message_id: string | null
          latest_sender: string | null
          latest_sent_at: string | null
          photographer_id: string | null
          title: string | null
          wedding_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "threads_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
      v_thread_first_inbound_at: {
        Row: {
          ai_routing_metadata: Json | null
          first_inbound_at: string | null
          kind: Database["public"]["Enums"]["thread_kind"] | null
          photographer_id: string | null
          thread_id: string | null
          wedding_id: string | null
          wedding_stage: Database["public"]["Enums"]["project_stage"] | null
        }
        Relationships: [
          {
            foreignKeyName: "threads_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      backpatch_lazy_grouped_import_wedding_link: {
        Args: {
          p_gmail_label_import_group_id: string
          p_import_candidate_id: string
          p_photographer_id: string
          p_thread_id: string
          p_wedding_id: string
        }
        Returns: undefined
      }
      check_user_exists: { Args: { lookup_email: string }; Returns: boolean }
      claim_draft_for_outbound: {
        Args: {
          p_draft_id: string
          p_edited_body?: string
          p_photographer_id: string
        }
        Returns: {
          body: string
          id: string
          status: Database["public"]["Enums"]["draft_status"]
          thread_id: string
        }[]
      }
      classify_inbound_suppression: {
        Args: { p_body: string; p_sender_raw: string; p_subject: string }
        Returns: Json
      }
      complete_escalation_resolution_authorized_case_exception: {
        Args: {
          p_effective_from: string
          p_effective_until: string
          p_escalation_id: string
          p_learning_outcome: Database["public"]["Enums"]["escalation_learning_outcome"]
          p_notes: string
          p_override_payload: Json
          p_overrides_action_key: string
          p_photographer_id: string
          p_target_playbook_rule_id: string
          p_thread_id: string
          p_wedding_id: string
        }
        Returns: string
      }
      complete_escalation_resolution_document: {
        Args: {
          p_escalation_id: string
          p_learning_outcome: Database["public"]["Enums"]["escalation_learning_outcome"]
          p_metadata: Json
          p_photographer_id: string
          p_title: string
          p_wedding_id: string
        }
        Returns: string
      }
      complete_escalation_resolution_memory: {
        Args: {
          p_escalation_id: string
          p_full_content: string
          p_learning_outcome: Database["public"]["Enums"]["escalation_learning_outcome"]
          p_photographer_id: string
          p_summary: string
          p_title: string
          p_wedding_id: string
        }
        Returns: string
      }
      complete_escalation_resolution_playbook: {
        Args: {
          p_action_key: string
          p_escalation_id: string
          p_instruction: string
          p_learning_outcome: Database["public"]["Enums"]["escalation_learning_outcome"]
          p_photographer_id: string
          p_topic: string
        }
        Returns: string
      }
      complete_gmail_import_materialize_new_thread: {
        Args: {
          p_ai_routing_metadata: Json
          p_clear_import_approval_error: boolean
          p_connected_account_id: string
          p_external_thread_key: string
          p_import_candidate_id: string
          p_import_provenance: Json
          p_last_activity_at: string
          p_message_body: string
          p_message_metadata: Json
          p_message_raw_payload: Json
          p_message_sender: string
          p_message_sent_at: string
          p_photographer_id: string
          p_render_artifact_id: string
          p_thread_title: string
          p_thread_wedding_id: string
        }
        Returns: {
          out_message_id: string
          out_thread_id: string
        }[]
      }
      complete_google_oauth_connection: {
        Args: {
          p_access_token: string
          p_display_name: string
          p_email: string
          p_photographer_id: string
          p_provider: string
          p_provider_account_id: string
          p_refresh_token: string
          p_token_expires_at: string
        }
        Returns: string
      }
      complete_learning_loop_operator_resolution: {
        Args: {
          p_artifacts: Json
          p_escalation_id: string
          p_learning_outcome: Database["public"]["Enums"]["escalation_learning_outcome"]
          p_photographer_id: string
          p_thread_id: string
          p_wedding_id: string
        }
        Returns: Json
      }
      complete_task: { Args: { p_task_id: string }; Returns: Json }
      convert_unfiled_thread_to_inquiry: {
        Args: {
          p_couple_names?: string
          p_lead_client_name?: string
          p_thread_id: string
        }
        Returns: Json
      }
      delete_inbox_thread: { Args: { p_thread_id: string }; Returns: Json }
      domain_is_ota_or_marketplace: {
        Args: { p_domain: string }
        Returns: boolean
      }
      extract_sender_email_from_raw: {
        Args: { p_raw: string }
        Returns: string
      }
      finalize_gmail_import_link_existing_thread: {
        Args: {
          p_clear_import_approval_error: boolean
          p_import_candidate_id: string
          p_import_provenance: Json
          p_photographer_id: string
          p_thread_id: string
          p_thread_wedding_id: string
        }
        Returns: undefined
      }
      finalize_onboarding_briefing_v1: {
        Args: {
          p_knowledge_base_rows: Json
          p_photographer_id: string
          p_playbook_rules: Json
          p_settings: Json
          p_studio_business_profile: Json
        }
        Returns: undefined
      }
      gmail_import_candidate_artifact_inline_html_repair_backlog_coun: {
        Args: never
        Returns: number
      }
      gmail_import_candidate_artifact_inline_html_repair_candidates_v: {
        Args: { p_after?: string; p_limit?: number }
        Returns: {
          id: string
          materialization_artifact: Json
          photographer_id: string
        }[]
      }
      gmail_import_secondary_pending_open_count_for_photographer_v1: {
        Args: { p_photographer_id: string }
        Returns: number
      }
      gmail_messages_inline_html_repair_backlog_count_v1: {
        Args: never
        Returns: number
      }
      gmail_messages_inline_html_repair_candidates_v1: {
        Args: { p_after?: string; p_limit?: number }
        Returns: {
          id: string
          metadata: Json
          photographer_id: string
        }[]
      }
      link_thread_to_wedding: {
        Args: { p_thread_id: string; p_wedding_id: string }
        Returns: Json
      }
      local_part_has_marketing_or_system_token: {
        Args: { p_local: string }
        Returns: {
          has_marketing: boolean
          has_system: boolean
        }[]
      }
      match_knowledge: {
        Args: {
          match_count: number
          match_threshold: number
          p_document_type?: string
          p_photographer_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          created_at: string
          document_type: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      replace_authorized_case_exception_for_escalation: {
        Args: {
          p_effective_from: string
          p_effective_until: string
          p_escalation_id: string
          p_notes: string
          p_override_payload: Json
          p_overrides_action_key: string
          p_photographer_id: string
          p_target_playbook_rule_id: string
          p_thread_id: string
          p_wedding_id: string
        }
        Returns: string
      }
      review_playbook_rule_candidate: {
        Args: {
          p_action: string
          p_candidate_id: string
          p_override_action_key?: string
          p_override_decision_mode?: Database["public"]["Enums"]["decision_mode"]
          p_override_instruction?: string
          p_override_topic?: string
          p_photographer_id: string
          p_superseded_by_candidate_id?: string
        }
        Returns: Json
      }
      validate_studio_base_location_shape: {
        Args: { p_value: Json }
        Returns: boolean
      }
      validate_studio_service_area_row_shape: {
        Args: { p_value: Json }
        Returns: boolean
      }
      validate_studio_service_areas_shape: {
        Args: { p_value: Json }
        Returns: boolean
      }
    }
    Enums: {
      automation_mode: "auto" | "draft_only" | "human_only"
      contact_point_kind: "email" | "phone" | "whatsapp" | "instagram" | "other"
      decision_mode: "auto" | "draft_only" | "ask_first" | "forbidden"
      document_kind:
        | "invoice"
        | "contract"
        | "questionnaire"
        | "timeline"
        | "insurance"
        | "price_guide"
        | "gallery_export"
        | "attachment"
        | "other"
      draft_status: "pending_approval" | "approved" | "rejected"
      escalation_learning_outcome: "one_off_case" | "reusable_playbook"
      escalation_operator_delivery:
        | "urgent_now"
        | "batch_later"
        | "dashboard_only"
      escalation_status: "open" | "answered" | "dismissed" | "promoted"
      event_type: "about_call" | "timeline_call" | "gallery_reveal" | "other"
      message_direction: "in" | "out" | "internal"
      memory_scope: "project" | "person" | "studio"
      person_kind: "individual" | "organization"
      project_stage:
        | "inquiry"
        | "consultation"
        | "proposal_sent"
        | "contract_out"
        | "booked"
        | "prep"
        | "final_balance"
        | "delivered"
        | "archived"
      rule_scope: "global" | "channel"
      task_status: "open" | "completed"
      thread_channel:
        | "email"
        | "web"
        | "whatsapp_operator"
        | "manual"
        | "system"
      thread_kind: "group" | "planner_only" | "other"
      thread_wedding_relation: "primary" | "mentioned" | "candidate"
      wedding_project_type:
        | "wedding"
        | "portrait"
        | "commercial"
        | "family"
        | "editorial"
        | "brand_content"
        | "other"
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
      automation_mode: ["auto", "draft_only", "human_only"],
      contact_point_kind: ["email", "phone", "whatsapp", "instagram", "other"],
      decision_mode: ["auto", "draft_only", "ask_first", "forbidden"],
      document_kind: [
        "invoice",
        "contract",
        "questionnaire",
        "timeline",
        "insurance",
        "price_guide",
        "gallery_export",
        "attachment",
        "other",
      ],
      draft_status: ["pending_approval", "approved", "rejected"],
      escalation_learning_outcome: ["one_off_case", "reusable_playbook"],
      escalation_operator_delivery: [
        "urgent_now",
        "batch_later",
        "dashboard_only",
      ],
      escalation_status: ["open", "answered", "dismissed", "promoted"],
      event_type: ["about_call", "timeline_call", "gallery_reveal", "other"],
      message_direction: ["in", "out", "internal"],
      memory_scope: ["project", "person", "studio"],
      person_kind: ["individual", "organization"],
      project_stage: [
        "inquiry",
        "consultation",
        "proposal_sent",
        "contract_out",
        "booked",
        "prep",
        "final_balance",
        "delivered",
        "archived",
      ],
      rule_scope: ["global", "channel"],
      task_status: ["open", "completed"],
      thread_channel: ["email", "web", "whatsapp_operator", "manual", "system"],
      thread_kind: ["group", "planner_only", "other"],
      thread_wedding_relation: ["primary", "mentioned", "candidate"],
      wedding_project_type: [
        "wedding",
        "portrait",
        "commercial",
        "family",
        "editorial",
        "brand_content",
        "other",
      ],
    },
  },
} as const
