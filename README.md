# Miroirs des favoris GitHub

Une page locale pour garder une copie complète (toutes les branches et tous les tags) des dépôts
mis en favori sur GitHub, au cas où l'un d'eux disparaîtrait ou passerait en privé.

La page ne lance rien toute seule. Elle affiche, pour chaque favori, le dernier push sur
GitHub, la date de la copie locale et un statut (pas de copie, en retard, à jour, hors favoris),
puis donne la commande à copier dans un terminal. On met à jour ce qu'on veut, quand on veut.

## Lancer

PHP 8 ou plus. Servir le dossier (Apache, ou `php -S localhost:8000`) et ouvrir
`index.php?user=<user>`, à garder en favori du navigateur. Sans paramètre, la page demande le
compte à suivre : aucun nom de compte n'est écrit dans le code.

La liste des favoris vient de l'API publique de GitHub, sans token : 60 requêtes par heure,
d'où le cache dans le navigateur et le bouton « Actualiser ».

## Commandes produites

```bash
# Première copie
git clone --mirror https://github.com/<owner>/<repo>.git repos/<owner>__<repo>.git
# Mises à jour
git -C repos/<owner>__<repo>.git remote update
```

Les copies vont dans `repos/`, ignoré par git. Clonage en HTTPS anonyme : aucune clé SSH ni
aucun compte n'est utilisé.

- Mise à jour sans `--prune` : une branche supprimée sur GitHub reste dans la copie. Un
  force-push, lui, remplace la branche locale.
- Un miroir copie aussi les références des pull requests : la copie peut dépasser la taille
  annoncée par GitHub.
- Les copies vivent sur le même disque que le reste : penser à sauvegarder `repos/` ailleurs.
