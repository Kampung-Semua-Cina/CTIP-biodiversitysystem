// apps/mobile/tests/helpers/demoProfiles.mjs
// Sample staff profiles for the agent test suites. They used to live in
// apps/shared/data.js, which ships in every build; the apps now load profiles
// from the API only. The ids and emails are the team's demo accounts.

export const DEMO_USER = {
  botanist: "b534e73d-1431-43c5-8383-5c68cee64b96",
  officer: "a6a215b0-2b03-4f0e-9a1d-52da140525a4",
  admin: "b8372536-a1c4-41d6-8b14-d700b6379949",
};

export const DEMO_EMAILS = {
  botanist: "botanist123@gmail.com",
  officer: "officer123@gmail.com",
  admin: "admin123456@gmail.com",
};

export const initialProfiles = [
  { id: "b8372536-a1c4-41d6-8b14-d700b6379949", full_name: "Admin User", username: "admin", phone: "", avatar_url: null, email: "admin123456@gmail.com", role: "admin", is_active: true, created_at: "2026-10-07T00:00:00Z" },
  { id: "a6a215b0-2b03-4f0e-9a1d-52da140525a4", full_name: "Conservation Officer", username: "officer", phone: "", avatar_url: null, email: "officer123@gmail.com", role: "officer", is_active: true, created_at: "2026-10-07T00:00:00Z" },
  { id: "b534e73d-1431-43c5-8383-5c68cee64b96", full_name: "Field Botanist", username: "botanist", phone: "", avatar_url: null, email: "botanist123@gmail.com", role: "botanist", is_active: true, created_at: "2026-10-07T00:00:00Z" },
  { id: "f444107e-6519-4dfc-aff1-40724daf634d", full_name: "Test User", username: "test", phone: "", avatar_url: null, email: "test123@gmail.com", role: "officer", is_active: false, created_at: "2026-10-07T00:00:00Z" },
];
