export type Lead = {
  id: string;
  name: string;
  company: string;
  email: string | null;
  status: string;
};

export type LeadsResponse = { leads: Lead[] } | { error: string };
