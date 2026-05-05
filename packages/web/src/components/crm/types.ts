// ════════════════════════════════════════════
// CRM TYPES
// ════════════════════════════════════════════
export interface Lead {
  id: string;
  lead_number?: number;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  country: string;
  language: string;
  source: string;
  status: string;
  assigned_to: string | null;
  assigned_name?: string | null;
  department: string;
  priority: string;
  ftd_amount: string;
  ftd_date: string | null;
  last_contact: string | null;
  next_follow_up: string | null;
  notes_count: number;
  calls_count: number;
  kyc_status?: string;
  kyc_url?: string;
  kyc_sent_at?: string;
  kyc_completed_at?: string;
  converted_user_id?: string | null;
  ip_address?: string;
  created_at: string;
  affiliate?: { name: string; tracking_code?: string };
  campaign?: { name: string };
  notes?: any[];
  calls?: any[];
  tasks?: any[];
}

export interface Agent {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface Affiliate {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  tracking_code: string;
  api_key: string;
  commission_type: string;
  cpa_amount: string;
  cpl_amount: string;
  revenue_share: number;
  total_leads: number;
  total_ftds: number;
  total_commission: string;
  total_paid: string;
  status: string;
}

export interface CrmTask {
  id: string;
  lead_id: string | null;
  assigned_to: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  due_at: string;
  completed_at: string | null;
  lead?: { first_name: string; last_name: string; email: string };
}
