import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const SUPABASE_URL = 'https://hbclccxsfpljckxyyrtl.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_Jdmzt_nDTnsStmNeXOtUPw_Ewr8PCg9'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})