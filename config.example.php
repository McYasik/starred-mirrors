<?php

// Copier en config.php (ignoré par git) pour ranger les copies ailleurs que dans repos/,
// par exemple sur un disque externe. Sans config.php, les copies vont dans repos/.
// Le serveur web doit pouvoir lire ce dossier pour afficher dates et tailles.
return [
    'repos_dir' => '/chemin/vers/mes/miroirs',
];
