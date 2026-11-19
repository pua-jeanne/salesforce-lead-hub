export type Lead = {
  id: string;
  name: string;
  company: string;
  email: string | null;
  status: string;
};

export const LEADS_PAGE_SIZE = 20;
export const LEAD_FILTER_MAX_LENGTH = 120;

export type LeadsPage = {
  leads: Lead[];
  nextCursor: string | null;
  statuses?: string[];
};

export type LeadsResponse = LeadsPage | { error: string };
