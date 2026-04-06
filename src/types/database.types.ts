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
  public: {
    Tables: {
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
            foreignKeyName: "escalation_requests_wedding_id_fkey"
            columns: ["wedding_id"]
            isOneToOne: false
            referencedRelation: "weddings"
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
          full_content: string
          id: string
          photographer_id: string
          summary: string
          title: string
          type: string
          wedding_id: string | null
        }
        Insert: {
          full_content: string
          id?: string
          photographer_id: string
          summary: string
          title: string
          type: string
          wedding_id?: string | null
        }
        Update: {
          full_content?: string
          id?: string
          photographer_id?: string
          summary?: string
          title?: string
          type?: string
          wedding_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memories_photographer_id_fkey"
            columns: ["photographer_id"]
            isOneToOne: false
            referencedRelation: "photographers"
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
      tasks: {
        Row: {
          due_date: string
          id: string
          photographer_id: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
          wedding_id: string | null
        }
        Insert: {
          due_date: string
          id?: string
          photographer_id: string
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          wedding_id?: string | null
        }
        Update: {
          due_date?: string
          id?: string
          photographer_id?: string
          status?: Database["public"]["Enums"]["task_status"]
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
            foreignKeyName: "threads_wedding_id_fkey"
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
          id: string
          location: string
          package_name: string | null
          photographer_id: string
          stage: Database["public"]["Enums"]["project_stage"]
          story_notes: string | null
          strategic_pause: boolean
          wedding_date: string
        }
        Insert: {
          agency_cc_lock?: boolean
          balance_due?: number | null
          compassion_pause?: boolean
          contract_value?: number | null
          couple_names: string
          id?: string
          location: string
          package_name?: string | null
          photographer_id: string
          stage?: Database["public"]["Enums"]["project_stage"]
          story_notes?: string | null
          strategic_pause?: boolean
          wedding_date: string
        }
        Update: {
          agency_cc_lock?: boolean
          balance_due?: number | null
          compassion_pause?: boolean
          contract_value?: number | null
          couple_names?: string
          id?: string
          location?: string
          package_name?: string | null
          photographer_id?: string
          stage?: Database["public"]["Enums"]["project_stage"]
          story_notes?: string | null
          strategic_pause?: boolean
          wedding_date?: string
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
      [_ in never]: never
    }
    Functions: {
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
          id: string
          metadata: Json
          similarity: number
        }[]
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
      escalation_operator_delivery: "urgent_now" | "batch_later" | "dashboard_only"
      escalation_status: "open" | "answered" | "dismissed" | "promoted"
      event_type: "about_call" | "timeline_call" | "gallery_reveal" | "other"
      message_direction: "in" | "out" | "internal"
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
      escalation_operator_delivery: ["urgent_now", "batch_later", "dashboard_only"],
      escalation_status: ["open", "answered", "dismissed", "promoted"],
      event_type: ["about_call", "timeline_call", "gallery_reveal", "other"],
      message_direction: ["in", "out", "internal"],
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
    },
  },
} as const
