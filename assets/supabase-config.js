/* =========================================
   CONFIGURATION SUPABASE
   À trouver dans Supabase > Project Settings > API.

   La clé "anon / publishable" est faite pour être publique :
   la sécurité repose sur les règles de supabase/schema.sql.
   Ne mettez JAMAIS ici la clé "service_role / secret".

   Tant que ces valeurs sont vides, le site affiche data/menu.json.
========================================= */

window.SUPABASE_CONFIG = {
  url: "https://ddjstwtrowbkmcgtvooi.supabase.co",
  anonKey: "sb_publishable_vOnIBDYbOdg4Gxt6IhsTBg_nMuZlTBf"
};
