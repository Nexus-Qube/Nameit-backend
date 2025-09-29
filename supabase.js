const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eonkctdourzqkcueyoxx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvbmtjdGRvdXJ6cWtjdWV5b3h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwNTQ1MDMsImV4cCI6MjA3MzYzMDUwM30.Sc4WPjEwDeqxK0jm-HCGRpO9k5PtuHMGXZXFYCui-Sw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = supabase;