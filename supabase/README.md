# Mise en place de Supabase

Projet : `ddjstwtrowbkmcgtvooi`. L'administration se fait avec un seul compte, par e-mail et mot de passe.

## 1. Base de données

Pour une nouvelle base, exécutez `schema.sql` dans **SQL Editor**.

## 2. Créer le compte administrateur

1. Dans **Authentication > Users > Add user**, créez le compte avec un mot de passe long et unique (16 caractères ou plus, idéalement généré par un gestionnaire de mots de passe) et cochez « Auto Confirm User ».
2. Dans **SQL Editor**, désignez ce compte comme administrateur :

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'votre-email@exemple.com'
   on conflict do nothing;
   ```

## 3. Fermer les inscriptions

Dans **Authentication > Sign In / Providers**, désactivez « Allow new users to sign up ». Laissez le fournisseur **Email** activé : c'est lui qui permet la connexion.

Le dashboard est ensuite accessible sur `/admin/`.

## Mot de passe oublié

Dans **Authentication > Users**, ouvrez le compte et envoyez un lien de réinitialisation, ou changez le mot de passe depuis ce même écran.

## Clés

`assets/supabase-config.js` ne contient que la clé `publishable`, faite pour être publique. La clé `secret` / `service_role` et le mot de passe de la base ne doivent jamais apparaître dans le site.

Si Supabase ne répond pas, le site public affiche `data/menu.json`. Ce fichier n'est pas mis à jour par le dashboard.
