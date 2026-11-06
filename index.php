<?php
/*
 * Miroirs locaux des dépôts mis en favori (starred) sur GitHub.
 *
 * Invariant : cette page ne fait que lire. Elle ne lance jamais git et n'écrit rien (Apache
 * tourne en www-data) ; elle produit les commandes que l'utilisateur copie et lance lui-même.
 * Côté serveur : l'état des copies locales (repos/*.git). Côté navigateur : la liste des favoris,
 * lue sur l'API publique de GitHub (sans token) et gardée en cache dans localStorage.
 */

declare(strict_types=1);

// Dossier des copies : repos/ à côté de la page, sauf si config.php (local, ignoré par git)
// en désigne un autre, par exemple sur un disque externe. Modèle : config.example.php.
$config     = is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
$configure  = is_array($config) && !empty($config['repos_dir']);
define('REPOS_DIR', $configure ? rtrim((string) $config['repos_dir'], '/') : __DIR__ . '/repos');

// Un miroir se nomme <owner>__<repo>.git ; tout autre dossier est ignoré.
const NOM_MIROIR = '/^([A-Za-z0-9._-]+)__([A-Za-z0-9._-]+)\.git$/';

/** Taille cumulée d'un dossier, en octets. */
function taille_dossier(string $dossier): int {
    $total = 0;
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dossier, FilesystemIterator::SKIP_DOTS)
    );
    foreach ($it as $fichier) {
        $total += $fichier->getSize();
    }
    return $total;
}

/**
 * État des copies locales : clé "owner/repo" en minuscules (GitHub ignore la casse).
 * Dernière synchro = FETCH_HEAD, réécrit à chaque remote update ; à défaut, packed-refs,
 * écrit par le clone initial.
 *
 * @return array<string, array<string, mixed>>
 */
function etat_local(): array {
    $etat = [];
    $noms = is_dir(REPOS_DIR) ? @scandir(REPOS_DIR) : false;
    if ($noms === false) {
        return $etat;
    }
    foreach ($noms as $nom) {
        if (!preg_match(NOM_MIROIR, $nom, $m) || !is_dir(REPOS_DIR . '/' . $nom)) {
            continue;
        }
        $chemin = REPOS_DIR . '/' . $nom;
        $synchro = null;
        foreach (['FETCH_HEAD', 'packed-refs'] as $temoin) {
            if (is_file($chemin . '/' . $temoin)) {
                $synchro = max($synchro ?? 0, filemtime($chemin . '/' . $temoin));
            }
        }
        $etat[strtolower($m[1] . '/' . $m[2])] = [
            'nom'     => $m[1] . '/' . $m[2],
            'dossier' => $nom,
            'synchro' => $synchro ? date(DATE_ATOM, $synchro) : null,
            'taille'  => taille_dossier($chemin),
        ];
    }
    return $etat;
}

// Compte suivi : paramètre ?user=, jamais écrit dans le code (rien ne relie le dépôt à un
// compte). Format GitHub : 1 à 39 caractères, lettres, chiffres et tirets non initiaux.
$user = $_GET['user'] ?? '';
if (!preg_match('/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/', $user)) {
    $user = null;
}

// Un dossier configuré absent (disque non monté) ou illisible pour le serveur web ferait croire
// qu'aucune copie n'existe : on le signale. repos/ absent par défaut = rien de copié, c'est normal.
$probleme = null;
if (!is_dir(REPOS_DIR)) {
    $probleme = $configure ? 'Dossier des copies introuvable (disque non monté ?) : les statuts sont faux.' : null;
} elseif (!is_readable(REPOS_DIR) || @scandir(REPOS_DIR) === false) {
    $probleme = 'Dossier des copies illisible pour le serveur web : les statuts sont faux, les commandes restent justes.';
}

$donnees = [
    'user'     => $user,
    'reposDir' => REPOS_DIR,
    'local'    => (object) etat_local(),
];
?><!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Miroirs des favoris GitHub</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
<header>
    <h1>Miroirs des favoris GitHub</h1>
<?php if ($user === null): ?>
</header>
<main>
    <!-- Sans compte valide : seul ce formulaire. Mettre ensuite la page en favori avec ?user=. -->
    <form method="get">
        <?php if (isset($_GET['user'])): ?>
            <p id="erreur-user" class="erreur">Nom de compte GitHub invalide.</p>
        <?php endif; ?>
        <label for="user">Compte GitHub dont suivre les favoris</label>
        <input type="text" id="user" name="user" required autocomplete="username" spellcheck="false"
            <?= isset($_GET['user']) ? 'aria-invalid="true" aria-describedby="erreur-user"' : '' ?>>
        <button type="submit">Afficher</button>
    </form>
</main>
</body>
</html>
<?php return; endif; ?>
    <p>Favoris de <a href="https://github.com/<?= htmlspecialchars($user) ?>?tab=stars"><?= htmlspecialchars($user) ?></a>,
        copiés dans <code><?= htmlspecialchars(REPOS_DIR) ?></code><?= $configure ? ' (config.php)' : '' ?>.
        La page ne lance rien : elle donne les commandes à copier.</p>
    <?php if ($probleme): ?>
        <p class="erreur" role="alert"><?= htmlspecialchars($probleme) ?></p>
    <?php endif; ?>
</header>

<main>
    <div class="barre">
        <button type="button" id="actualiser">Actualiser depuis GitHub</button>
        <span id="source" class="discret"></span>
        <label for="tri">Trier par</label>
        <select id="tri">
            <option value="push">Dernier push GitHub</option>
            <option value="statut">Statut</option>
            <option value="nom">Nom</option>
            <option value="taille">Taille GitHub</option>
        </select>
    </div>
    <p id="annonce" class="annonce" role="status" aria-live="polite"></p>

    <table>
        <caption>Favoris et état de leur copie locale</caption>
        <thead>
        <tr>
            <th scope="col"><span class="sr-only">Sélection</span></th>
            <th scope="col">Dépôt</th>
            <th scope="col">Dernier push GitHub</th>
            <th scope="col">Dernière copie locale</th>
            <th scope="col">Taille GitHub / locale</th>
            <th scope="col">Statut</th>
            <th scope="col">Commande</th>
        </tr>
        </thead>
        <tbody id="lignes">
        <tr><td colspan="7">Chargement…</td></tr>
        </tbody>
    </table>

    <section aria-labelledby="titre-selection">
        <h2 id="titre-selection">Commandes de la sélection</h2>
        <p class="discret" id="aide-selection">Cocher des dépôts dans le tableau. Une commande par ligne, à coller dans un terminal.</p>
        <textarea id="selection" rows="6" readonly aria-labelledby="titre-selection" aria-describedby="aide-selection"></textarea>
        <button type="button" id="copier-selection">Copier la sélection</button>
    </section>

    <section aria-labelledby="titre-notes">
        <h2 id="titre-notes">À savoir</h2>
        <ul>
            <li>Mise à jour sans <code>--prune</code> : une branche supprimée sur GitHub reste dans la copie.
                Un force-push, lui, remplace la branche locale.</li>
            <li>Un miroir copie aussi les références des pull requests (<code>refs/pull/*</code>) : la copie
                peut dépasser la taille annoncée par GitHub.</li>
            <li>Statut « Hors favoris » : copie locale dont le dépôt n'est plus dans tes favoris, ou a disparu
                de GitHub. La copie est conservée.</li>
        </ul>
    </section>
</main>

<script type="application/json" id="donnees"><?= json_encode($donnees, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?></script>
<script src="app.js"></script>
</body>
</html>
