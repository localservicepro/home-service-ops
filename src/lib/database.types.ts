// Generated from the Supabase schema (project gcuzmuztikisxsmkgtbi), trimmed to Row types, enums and RPCs.
// Regenerate the full file with:
//   npx supabase gen types typescript --project-id gcuzmuztikisxsmkgtbi > src/lib/database.types.ts
// src/lib/types.ts derives its enums from here and type-checks every domain interface against these rows.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      activity: {
        Row: { business_id: string; created_at: string; id: string; job_id: string | null; kind: string; message: string; quote_id: string | null }
      }
      addons: {
        Row: { active: boolean; business_id: string; created_at: string; id: string; name: string; price: number; service_ids: string[] }
      }
      businesses: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          next_job_num: number
          next_quote_num: number
          onboarded_at: string | null
          plan: string
          trade: string | null
          trial_ends_at: string
        }
      }
      clients: {
        Row: { addresses: Json; business_id: string; created_at: string; email: string | null; id: string; name: string; notes: string | null; phone: string | null }
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          business_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database['public']['Enums']['member_role']
          sent_at: string | null
          staff_id: string | null
          token: string
        }
      }
      jobs: {
        Row: {
          address: string | null
          amount_paid: number
          business_id: string
          client_id: string | null
          created_at: string
          customer: string
          discount: number
          email: string | null
          frequency: string
          gst: boolean
          id: string
          invoice_sent_at: string | null
          line_items: Json
          notes: string | null
          num: string
          paid_at: string | null
          pay_method: Database['public']['Enums']['pay_method'] | null
          pay_state: Database['public']['Enums']['pay_state']
          phone: string | null
          photos: Json
          price: number
          public_token: string
          quote_id: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          service: string | null
          source: string
          staff_id: string | null
          status: Database['public']['Enums']['job_status']
          updated_at: string
          work_elapsed_ms: number
          work_started_at: string | null
          work_state: Database['public']['Enums']['work_state']
        }
      }
      memberships: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: Database['public']['Enums']['member_role']
          staff_id: string | null
          user_id: string
        }
      }
      payments: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          id: string
          job_id: string
          method: Database['public']['Enums']['pay_method']
          note: string | null
          paid_at: string
          recorded_by: string | null
        }
      }
      quotes: {
        Row: {
          address: string | null
          business_id: string
          client_id: string | null
          created_at: string
          customer: string
          decline_reason: string | null
          discount: number
          email: string | null
          gst: boolean
          id: string
          line_items: Json
          note: string | null
          num: string
          phone: string | null
          price: number
          public_token: string
          request_job_id: string | null
          responded_at: string | null
          sent_at: string | null
          status: Database['public']['Enums']['quote_status']
          updated_at: string
          valid_until: string | null
          viewed_at: string | null
        }
      }
      services: {
        Row: { active: boolean; business_id: string; created_at: string; frequency: string; id: string; name: string; price: number; sort: number }
      }
      settings: {
        Row: {
          abn: string | null
          address: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_bsb: string | null
          business_id: string
          business_name: string | null
          email: string | null
          integrations: Json
          logo_url: string | null
          online_payment_url: string | null
          owner_email: string | null
          owner_name: string | null
          owner_phone: string | null
          payment_methods: Json
          payment_terms_days: number
          phone: string | null
          updated_at: string
        }
      }
      staff: {
        Row: {
          active: boolean
          business_id: string
          colour: string
          created_at: string
          duty: Database['public']['Enums']['duty_status']
          email: string | null
          id: string
          name: string
          pay_rate: number
          phone: string | null
          rate_type: Database['public']['Enums']['rate_type']
          role: string
        }
      }
    }
    Functions: {
      accept_invite: { Args: { tok: string }; Returns: string }
      create_business: { Args: { bname: string }; Returns: string }
      get_invite: { Args: { tok: string }; Returns: Json }
      get_public_invoice: { Args: { tok: string }; Returns: Json }
      get_public_quote: { Args: { tok: string }; Returns: Json }
      respond_to_quote: { Args: { accept: boolean; preferred_date?: string; reason?: string; tok: string }; Returns: Json }
      set_my_duty: { Args: { bid: string; d: Database['public']['Enums']['duty_status'] }; Returns: undefined }
    }
    Enums: {
      duty_status: 'Available' | 'On job' | 'Off today'
      job_status: 'New' | 'Quote Sent' | 'Job Scheduled' | 'In Progress' | 'Done' | 'Paid' | 'Cancelled'
      member_role: 'owner' | 'admin' | 'crew'
      pay_method: 'cash' | 'bank' | 'card'
      pay_state: 'awaiting' | 'paid'
      quote_status: 'Draft' | 'Sent' | 'Accepted' | 'Declined'
      rate_type: 'hour' | 'job'
      work_state: 'idle' | 'running' | 'done'
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]
