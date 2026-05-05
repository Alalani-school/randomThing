import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabase = createClient(
  'YOUR_URL',
  'YOUR_ANON_KEY'
)

export default supabase
