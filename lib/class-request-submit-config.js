'use strict';

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://evninlytzhtacanrguhx.supabase.co').replace(/\/+$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { url: url, serviceKey: serviceKey, configured: !!(url && serviceKey) };
}

module.exports = { supabaseConfig: supabaseConfig };
